import { z } from "zod";

/** Organization payloads (Epic 3 RBAC). Invitations are by EMAIL — clients
 *  never see or send raw user ids. */

export const OrgCreateSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(120),
});

export type OrgCreateInput = z.infer<typeof OrgCreateSchema>;

export const OrgRoleSchema = z.enum(["admin", "editor", "viewer", "guest"]);
export type OrgRoleInput = z.infer<typeof OrgRoleSchema>;

export const OrgMemberAddSchema = z.object({
  email: z.string().trim().email("A valid email is required").max(254),
  role: OrgRoleSchema.default("viewer"),
});

export type OrgMemberAddInput = z.infer<typeof OrgMemberAddSchema>;

export const OrgMemberRolePatchSchema = z.object({
  email: z.string().trim().email().max(254),
  role: OrgRoleSchema,
});

export type OrgMemberRolePatchInput = z.infer<typeof OrgMemberRolePatchSchema>;

export const OrgMemberRemoveSchema = z.object({
  email: z.string().trim().email().max(254),
});
