import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { projectService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/projects/:projectId — delete the project and every diagram
 * in it (diagram rows + child resources cascade at the database level,
 * inside one transaction).
 *
 * 200 with data:false for both missing rows and rows owned by someone
 * else — existence is never leaked.
 */
export const DELETE = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const deleted = await projectService.remove(ctx.params.projectId, ctx.user!.id);
    return ctx.json(deleted);
  },
  {
    auth: "required",
    rateLimit: { key: "projects:delete", limit: 30, windowMs: 60_000 },
    name: "projects.delete",
  }
);
