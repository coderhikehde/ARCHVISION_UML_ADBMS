import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { commentService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    await commentService.remove(ctx.params.commentId, ctx.user!.id);
    return ctx.json(null);
  },
  { auth: "required", rateLimit: { key: "comments:delete", limit: 30, windowMs: 60_000 }, name: "comments.delete" }
);
