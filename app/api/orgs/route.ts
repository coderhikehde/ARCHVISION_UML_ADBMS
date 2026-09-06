import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { orgService } from "@/lib/services";
import { OrgCreateSchema, type OrgCreateInput } from "@/lib/validation/schemas/org.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/orgs — organizations the caller belongs to, with their role. */
export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const orgs = await orgService.list(ctx.user!.id);
    return ctx.json(orgs);
  },
  {
    auth: "required",
    rateLimit: { key: "orgs:list", limit: 60, windowMs: 60_000 },
    name: "orgs.list",
  }
);

/** POST /api/orgs — create an organization; the creator becomes its first admin. */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<OrgCreateInput>();
    const org = await orgService.create(input.name, ctx.user!.id);
    return ctx.json(org, { status: 201 });
  },
  {
    auth: "required",
    rateLimit: { key: "orgs:create", limit: 10, windowMs: 60_000 },
    bodySchema: OrgCreateSchema,
    name: "orgs.create",
  }
);
