import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { diagramService } from "@/lib/services";
import { DiagramPatchSchema, type DiagramPatchInput } from "@/lib/validation/schemas/diagram.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/diagrams/:diagramId — fetch one diagram.
 * 200 with data:null when missing or not owned (same signal for both —
 * row existence is never leaked through the status code).
 */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const diagram = await diagramService.get(ctx.params.diagramId, ctx.user!.id);
    return ctx.json(diagram);
  },
  {
    auth: "required",
    rateLimit: { key: "diagram:get", limit: 60, windowMs: 60_000 },
    name: "diagram.get",
  }
);

/**
 * PATCH /api/diagrams/:diagramId — partial update.
 * Optimistic concurrency: when the body carries `expectedUpdatedAt` and
 * the stored row changed since, responds 409 Conflict.
 */
export const PATCH = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const body = await ctx.body<DiagramPatchInput>();
    const { expectedUpdatedAt, ...patch } = body;
    const diagram = await diagramService.update(ctx.params.diagramId, patch, ctx.user!.id, expectedUpdatedAt);
    return ctx.json(diagram);
  },
  {
    auth: "required",
    rateLimit: { key: "diagram:update", limit: 120, windowMs: 60_000 },
    bodySchema: DiagramPatchSchema,
    name: "diagram.update",
  }
);

/** DELETE /api/diagrams/:diagramId — delete with explicit child cascade. */
export const DELETE = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const deleted = await diagramService.remove(ctx.params.diagramId, ctx.user!.id);
    return ctx.json(deleted);
  },
  {
    auth: "required",
    rateLimit: { key: "diagram:delete", limit: 30, windowMs: 60_000 },
    name: "diagram.delete",
  }
);