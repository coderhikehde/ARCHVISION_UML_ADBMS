import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { parsePagination } from "@/lib/http/pagination";
import { diagramService } from "@/lib/services";
import { ListDiagramsQuerySchema } from "@/lib/validation/schemas/diagram.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/diagrams — list the caller's diagrams across projects.
 * Optional ?projectId= narrows to one project. Kept as a top-level
 * endpoint because the client workspace store lists everything.
 */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const page = parsePagination(ctx.query);
    const query = ctx.queryData as { projectId?: string };
    const diagrams = await diagramService.list(ctx.user!.id, query.projectId ?? null, page);
    return ctx.json(diagrams);
  },
  {
    auth: "required",
    rateLimit: { key: "diagrams:list", limit: 60, windowMs: 60_000 },
    querySchema: ListDiagramsQuerySchema,
    name: "diagrams.listAll",
  }
);