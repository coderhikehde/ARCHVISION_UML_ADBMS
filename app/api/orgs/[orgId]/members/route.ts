import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { orgService } from "@/lib/services";
import {
  OrgMemberAddSchema,
  OrgMemberRolePatchSchema,
  type OrgMemberAddInput,
  type OrgMemberRolePatchInput,
} from "@/lib/validation/schemas/org.schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orgs/:orgId/members — invite by email (admin only).
 * Non-admin members and outsiders are indistinguishable: both get
 * not_found (members) / forbidden semantics from the service.
 */
export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<OrgMemberAddInput>();
    const result = await orgService.inviteMember(ctx.params.orgId, ctx.user!.id, input.email, input.role);
    return ctx.json(result, { status: 201 });
  },
  {
    auth: "required",
    rateLimit: { key: "orgs:invite", limit: 30, windowMs: 60_000 },
    bodySchema: OrgMemberAddSchema,
    name: "orgs.invite",
  }
);

/** PATCH — change a member's role (admin only; self-demotion guarded). */
export const PATCH = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const input = await ctx.body<OrgMemberRolePatchInput>();
    await orgService.changeRole(ctx.params.orgId, ctx.user!.id, input.email, input.role);
    return ctx.json(null);
  },
  {
    auth: "required",
    rateLimit: { key: "orgs:role", limit: 30, windowMs: 60_000 },
    bodySchema: OrgMemberRolePatchSchema,
    name: "orgs.role",
  }
);

/** DELETE ?email= — remove a member (admin only; cannot remove self). */
export const DELETE = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const email = ctx.query.email?.trim() ?? "";
    await orgService.removeMember(ctx.params.orgId, ctx.user!.id, email);
    return ctx.json(null);
  },
  {
    auth: "required",
    rateLimit: { key: "orgs:remove", limit: 30, windowMs: 60_000 },
    name: "orgs.removeMember",
  }
);
