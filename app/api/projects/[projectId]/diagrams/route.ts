import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { parsePagination } from "@/lib/http/pagination";
import { BadRequestError } from "@/lib/http/api-error";
import { diagramService, idempotencyService } from "@/lib/services";
import { DiagramCreateSchema, ListDiagramsQuerySchema, type DiagramCreateInput } from "@/lib/validation/schemas/diagram.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY_MAX = 128;

function readIdempotencyKey(ctx: { header(name: string): string | null }): string | null {
  const key = ctx.header("idempotency-key");
  if (!key) return null;
  if (key.length > IDEMPOTENCY_KEY_MAX) {
    throw new BadRequestError("Idempotency-Key must be 128 characters or fewer");
  }
  return key;
}

/** GET /api/projects/:projectId/diagrams — list diagrams in a project. */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const page = parsePagination(ctx.query);
    const diagrams = await diagramService.list(ctx.user!.id, ctx.params.projectId, page);
    return ctx.json(diagrams);
  },
  {
    auth: "required",
    rateLimit: { key: "diagrams:list", limit: 60, windowMs: 60_000 },
    querySchema: ListDiagramsQuerySchema,
    name: "diagrams.list",
  }
);

/**
 * POST /api/projects/:projectId/diagrams — create a diagram.
 *
 * Supports the Idempotency-Key header: a replayed request returns the
 * stored 201 response without creating a second diagram.
 */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<DiagramCreateInput>();
    const create = () =>
      diagramService.create(
        { name: input.name, type: input.type, mermaidCode: input.mermaidCode },
        ctx.params.projectId,
        ctx.user!.id
      ).then((diagram) => ({ status: 201 as const, body: diagram }));

    const idemKey = readIdempotencyKey(ctx);
    if (idemKey) {
      const result = await idempotencyService.run(idemKey, ctx.user!.id, create);
      return ctx.json(result.body, { status: result.status });
    }
    const { status, body } = await create();
    return ctx.json(body, { status });
  },
  {
    auth: "required",
    rateLimit: { key: "diagrams:create", limit: 30, windowMs: 60_000 },
    bodySchema: DiagramCreateSchema,
    name: "diagrams.create",
  }
);