import type { PrismaClient } from "@/lib/generated/prisma/client/client.ts";
import type { OrgRepository, OrgRoleValue, OrgRow } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;
import type { Prisma } from "@/lib/generated/prisma/client/client.ts";

function toOrgRow(
  org: { id: string; name: string; createdAt: Date; members: Array<{ userId: string; role: string }> },
  callerId: string
): OrgRow {
  const membership = org.members.find((m) => m.userId === callerId);
  return {
    id: org.id,
    name: org.name,
    callerRole: (membership?.role ?? "viewer") as OrgRoleValue,
    memberCount: org.members.length,
    createdAt: org.createdAt.toISOString(),
  };
}

export function orgRepository(client: DbClient): OrgRepository {
  return {
    async listForUser(userId) {
      const rows = await client.organization.findMany({
        where: { members: { some: { userId } } },
        orderBy: { createdAt: "desc" },
        include: { members: { select: { userId: true, role: true } } },
      });
      return rows.map((row) => toOrgRow(row, userId));
    },

    async create(name, userId) {
      // Creator becomes the first admin — membership is written in the same
      // transaction as the organization so an org can never exist leaderless.
      const created = await client.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name },
          include: { members: { select: { userId: true, role: true } } },
        });
        await tx.workspaceMember.create({
          data: { organizationId: org.id, userId, role: "admin" },
        });
        return org;
      });
      return toOrgRow(
        { ...created, members: [{ userId, role: "admin" }] },
        userId
      );
    },

    async roleOf(orgId, userId) {
      const membership = await client.workspaceMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        select: { role: true },
      });
      return membership ? (membership.role as OrgRoleValue) : null;
    },

    async findUserIdByEmail(email) {
      const user = await client.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true },
      });
      return user?.id ?? null;
    },

    async addMember(orgId, userId, role) {
      await client.workspaceMember.create({
        data: { organizationId: orgId, userId, role },
      });
    },

    async changeRole(orgId, userId, role) {
      await client.workspaceMember.update({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        data: { role },
      });
    },

    async removeMember(orgId, userId) {
      await client.workspaceMember.delete({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });
    },
  };
}