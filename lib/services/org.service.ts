import type { OrgRoleValue, OrgRow, Repositories } from "@/lib/data/repositories/types";
import { ForbiddenError, NotFoundError } from "@/lib/http/api-error";

/**
 * OrgService — bounded context: multi-tenant workspaces & RBAC (Epic 3).
 *
 * Role model: admin > editor > viewer > guest.
 *   - create: the creator becomes the first admin (atomic with org insert)
 *   - invitations resolve users by EMAIL (never raw user ids from clients)
 *   - only admins may invite, change roles, or remove members
 *   - admins cannot demote/exclude THEMSELVES — an org must always keep at
 *     least one admin; ownership transfer is an explicit future action
 *
 * Non-members get NotFoundError (no existence leak), insufficient role gets
 * ForbiddenError.
 */

const ROLE_RANK: Record<OrgRoleValue, number> = { guest: 0, viewer: 1, editor: 2, admin: 3 };

export class OrgService {
  private readonly repos: Repositories;

  constructor(repos: Repositories) {
    this.repos = repos;
  }

  async list(userId: string): Promise<OrgRow[]> {
    return this.repos.orgs.listForUser(userId);
  }

  async create(name: string, userId: string): Promise<OrgRow> {
    const org = await this.repos.orgs.create(name, userId);
    void this.repos.auditLogs
      .append({ organizationId: org.id, userId, action: "org.create", targetType: "organization", targetId: org.id, metadata: { name } })
      .catch(() => undefined);
    return org;
  }

  /** Admin gate shared by every mutation. */
  private async requireAdmin(orgId: string, actorId: string): Promise<void> {
    const role = await this.repos.orgs.roleOf(orgId, actorId);
    if (!role) throw new NotFoundError();
    if (ROLE_RANK[role] < ROLE_RANK.admin) throw new ForbiddenError("Organization admin access required");
  }

  async inviteMember(orgId: string, actorId: string, email: string, role: OrgRoleValue): Promise<{ userId: string }> {
    await this.requireAdmin(orgId, actorId);
    const targetId = await this.repos.orgs.findUserIdByEmail(email);
    if (!targetId) throw new NotFoundError(`No user found for ${email}`);
    if (await this.repos.orgs.roleOf(orgId, targetId)) {
      throw new ForbiddenError(`${email} is already a member of this organization`);
    }
    await this.repos.orgs.addMember(orgId, targetId, role);
    void this.repos.auditLogs
      .append({ organizationId: orgId, userId: actorId, action: "org.invite", targetType: "user", targetId, metadata: { email, role } })
      .catch(() => undefined);
    return { userId: targetId };
  }

  async changeRole(orgId: string, actorId: string, targetEmail: string, role: OrgRoleValue): Promise<void> {
    await this.requireAdmin(orgId, actorId);
    const targetId = await this.repos.orgs.findUserIdByEmail(targetEmail);
    if (!targetId) throw new NotFoundError(`No user found for ${targetEmail}`);
    if (targetId === actorId) {
      // Self-demotion would risk leaving the org without an admin.
      if (role !== "admin") {
        throw new ForbiddenError("You cannot lower your own role — ask another admin to do it");
      }
      return;
    }
    await this.repos.orgs.changeRole(orgId, targetId, role);
    void this.repos.auditLogs
      .append({ organizationId: orgId, userId: actorId, action: "org.changeRole", targetType: "user", targetId, metadata: { email: targetEmail, role } })
      .catch(() => undefined);
  }

  async removeMember(orgId: string, actorId: string, targetEmail: string): Promise<void> {
    await this.requireAdmin(orgId, actorId);
    const targetId = await this.repos.orgs.findUserIdByEmail(targetEmail);
    if (!targetId) throw new NotFoundError(`No user found for ${targetEmail}`);
    if (targetId === actorId) {
      throw new ForbiddenError("You cannot remove yourself — ask another admin to do it");
    }
    await this.repos.orgs.removeMember(orgId, targetId);
    void this.repos.auditLogs
      .append({ organizationId: orgId, userId: actorId, action: "org.removeMember", targetType: "user", targetId, metadata: { email: targetEmail } })
      .catch(() => undefined);
  }
}