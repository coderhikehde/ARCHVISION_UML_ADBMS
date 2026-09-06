import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { commentService } from "@/lib/services";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateCommentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  x: z.number(),
  y: z.number(),
});

export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const comments = await commentService.list(ctx.params.diagramId, ctx.user!.id);
    return ctx.json(comments);
  },
  { auth: "required", rateLimit: { key: "comments:list", limit: 60, windowMs: 60_000 }, name: "comments.list" }
);

export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const { text, x, y } = await ctx.body<z.infer<typeof CreateCommentSchema>>();
    const comment = await commentService.create(ctx.params.diagramId, ctx.user!.id, text, x, y);
    return ctx.json(comment, { status: 201 });
  },
  { auth: "required", rateLimit: { key: "comments:create", limit: 30, windowMs: 60_000 }, bodySchema: CreateCommentSchema, name: "comments.create" }
);
