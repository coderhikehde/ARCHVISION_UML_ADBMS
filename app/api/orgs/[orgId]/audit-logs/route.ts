import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { parsePagination } from "@/lib/http/pagination";
import { auditLogService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/orgs/:orgId/audit-logs — append-only trail for the org.
 * Any member may read its own org's trail; outsiders get not_found.
 */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const page = parsePagination(ctx.query);
    const logs = await auditLogService.listForOrg(ctx.params.orgId, ctx.user!.id, page);
    return ctx.json(logs);
  },
  {
    auth: "required",
    rateLimit: { key: "audit:read", limit: 60, windowMs: 60_000 },
    name: "audit.list",
  }
);
