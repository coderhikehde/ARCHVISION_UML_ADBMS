import { withApiHandler } from "@/lib/http/with-api-handler";
import { aiAssistService } from "@/lib/services";
import { AiDescribeRequestSchema, type AiDescribeRequest } from "@/lib/validation/schemas/ai.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/ai/describe — online AI description provider.
 *
 * The client (lib/ai/describe.ts) treats this route as optional: any
 * failure (401/429/502/network) falls back to the deterministic local
 * description engine, which the UI labels as such. Deliberately NOT
 * streaming — descriptions are short.
 */
export const POST = withApiHandler(
  async (ctx) => {
    const payload = await ctx.body<AiDescribeRequest>();
    const { text } = await aiAssistService.describe(payload);
    return ctx.json({ text });
  },
  {
    auth: "required",
    rateLimit: { key: "describe", limit: 20, windowMs: 60_000 },
    bodySchema: AiDescribeRequestSchema,
    name: "ai.describe",
  }
);