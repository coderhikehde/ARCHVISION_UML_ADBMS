import { withApiHandler } from "@/lib/http/with-api-handler";
import { streamSse } from "@/lib/http/sse";
import { aiAssistService } from "@/lib/services";
import { AiChatRequestSchema, type AiChatRequest } from "@/lib/validation/schemas/ai.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai/chat — streaming AI assistant (SSE).
 */
export const POST = withApiHandler(
  async (ctx) => {
    const input = await ctx.body<AiChatRequest>();
    return streamSse(
      async (writer) => {
        try {
          await aiAssistService.streamChat(input, {
            write: (event, data) => writer.write(event, data),
            done: () => {
              writer.write("done", "ok");
              writer.end();
            },
          });
        } catch (err: unknown) {
          console.error("[ai.chat] stream handler error:", err);
          writer.write("error", err instanceof Error ? err.message : "Generation failed");
          writer.write("done", "ok");
          writer.end();
        }
      },
      { signal: ctx.request.signal }
    );
  },
  {
    auth: "optional",
    rateLimit: { key: "chat", limit: 60, windowMs: 60_000 },
    bodySchema: AiChatRequestSchema,
    stream: true,
    name: "ai.chat",
  }
);
