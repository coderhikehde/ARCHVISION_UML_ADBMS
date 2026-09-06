import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { validationService } from "@/lib/services";
import { ValidationResultSchema, type ValidationResultInput } from "@/lib/validation/schemas/validation.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/diagrams/:diagramId/validation — the latest report.
 * 200 with data:null when none exists yet.
 */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const report = await validationService.get(ctx.params.diagramId, ctx.user!.id);
    return ctx.json(report);
  },
  {
    auth: "required",
    rateLimit: { key: "validation:get", limit: 60, windowMs: 60_000 },
    name: "validation.get",
  }
);

/**
 * POST /api/diagrams/:diagramId/validation — persist a report and update
 * the diagram's isValid/validationScore in one transaction.
 */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<ValidationResultInput>();
    await validationService.save(ctx.params.diagramId, input, ctx.user!.id);
    return ctx.json(null);
  },
  {
    auth: "required",
    rateLimit: { key: "validation:create", limit: 60, windowMs: 60_000 },
    bodySchema: ValidationResultSchema,
    name: "validation.create",
  }
);