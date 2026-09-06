import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { parsePagination, totalCountHeader } from "@/lib/http/pagination";
import { projectService } from "@/lib/services";
import { ProjectCreateSchema, ListProjectsQuerySchema, type ProjectCreateInput } from "@/lib/validation/schemas/project.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/projects — list the caller's projects. */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const page = parsePagination(ctx.query);
    const [projects, total] = await Promise.all([
      projectService.list(ctx.user!.id, page),
      projectService.total(ctx.user!.id),
    ]);
    return ctx.json(projects, { headers: totalCountHeader(total) });
  },
  {
    auth: "required",
    rateLimit: { key: "projects:list", limit: 60, windowMs: 60_000 },
    querySchema: ListProjectsQuerySchema,
    name: "projects.list",
  }
);

/** POST /api/projects — create a project (quota enforced by ProjectService). */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<ProjectCreateInput>();
    const project = await projectService.create(input, ctx.user!.id);
    return ctx.json(project, { status: 201 });
  },
  {
    auth: "required",
    rateLimit: { key: "projects:create", limit: 30, windowMs: 60_000 },
    bodySchema: ProjectCreateSchema,
    name: "projects.create",
  }
);