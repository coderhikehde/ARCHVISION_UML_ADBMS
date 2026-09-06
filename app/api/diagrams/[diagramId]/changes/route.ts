import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { parsePagination } from "@/lib/http/pagination";
import { diagramService } from "@/lib/services";
import { ChangeRecordSchema, ListChildResourcesQuerySchema, type ChangeRecordInput } from "@/lib/validation/schemas/version.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/diagrams/:diagramId/changes — change log (newest first). */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const page = parsePagination(ctx.query, { limit: 30 });
    const changes = await diagramService.listChanges(ctx.params.diagramId, ctx.user!.id, page);
    return ctx.json(changes);
  },
  {
    auth: "required",
    rateLimit: { key: "changes:list", limit: 60, windowMs: 60_000 },
    querySchema: ListChildResourcesQuerySchema,
    name: "changes.list",
  }
);

/** POST /api/diagrams/:diagramId/changes — append a change-log entry. */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<ChangeRecordInput>();
    await diagramService.recordChange(ctx.params.diagramId, input.summary, ctx.user!.id);
    return ctx.json(null);
  },
  {
    auth: "required",
    rateLimit: { key: "changes:create", limit: 120, windowMs: 60_000 },
    bodySchema: ChangeRecordSchema,
    name: "changes.create",
  }
);