import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { parsePagination } from "@/lib/http/pagination";
import { BadRequestError } from "@/lib/http/api-error";
import { versionService, idempotencyService } from "@/lib/services";
import { VersionCreateSchema, ListChildResourcesQuerySchema, type VersionCreateInput } from "@/lib/validation/schemas/version.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY_MAX = 128;

/** GET /api/diagrams/:diagramId/versions — version history (newest first). */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const page = parsePagination(ctx.query, { limit: 50 });
    const versions = await versionService.list(ctx.params.diagramId, ctx.user!.id, page);
    return ctx.json(versions);
  },
  {
    auth: "required",
    rateLimit: { key: "versions:list", limit: 60, windowMs: 60_000 },
    querySchema: ListChildResourcesQuerySchema,
    name: "versions.list",
  }
);

/**
 * POST /api/diagrams/:diagramId/versions — snapshot the diagram.
 *
 * The server computes the next version number (max + 1) inside a
 * transaction; the (diagramId, version) unique constraint + retry loop
 * makes racing saves safe. Idempotency-Key replays return the originally
 * assigned number.
 */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<VersionCreateInput>();
    const save = () =>
      versionService
        .save(ctx.params.diagramId, input, ctx.user!.id)
        .then((version) => ({ status: 201 as const, body: { version } }));

    const key = ctx.header("idempotency-key");
    if (key) {
      if (key.length > IDEMPOTENCY_KEY_MAX) {
        throw new BadRequestError("Idempotency-Key must be 128 characters or fewer");
      }
      const result = await idempotencyService.run(key, ctx.user!.id, save);
      return ctx.json(result.body, { status: result.status });
    }
    const { status, body } = await save();
    return ctx.json(body, { status });
  },
  {
    auth: "required",
    rateLimit: { key: "versions:create", limit: 60, windowMs: 60_000 },
    bodySchema: VersionCreateSchema,
    name: "versions.create",
  }
);