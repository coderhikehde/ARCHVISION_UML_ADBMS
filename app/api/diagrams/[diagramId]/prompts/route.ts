import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { parsePagination } from "@/lib/http/pagination";
import { diagramService } from "@/lib/services";
import { PromptRecordSchema, ListChildResourcesQuerySchema, type PromptRecordInput } from "@/lib/validation/schemas/version.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/diagrams/:diagramId/prompts — prompt history (newest first). */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const page = parsePagination(ctx.query, { limit: 50 });
    const entries = await diagramService.listPromptHistory(ctx.params.diagramId, ctx.user!.id, page);
    return ctx.json(entries);
  },
  {
    auth: "required",
    rateLimit: { key: "prompts:list", limit: 60, windowMs: 60_000 },
    querySchema: ListChildResourcesQuerySchema,
    name: "prompts.list",
  }
);

/** POST /api/diagrams/:diagramId/prompts — record an AI prompt + response. */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<PromptRecordInput>();
    await diagramService.recordPrompt(ctx.params.diagramId, input, ctx.user!.id);
    return ctx.json(null);
  },
  {
    auth: "required",
    rateLimit: { key: "prompts:create", limit: 120, windowMs: 60_000 },
    bodySchema: PromptRecordSchema,
    name: "prompts.create",
  }
);