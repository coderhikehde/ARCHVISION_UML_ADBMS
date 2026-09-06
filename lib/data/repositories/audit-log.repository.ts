import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client/client.ts";
import type { AuditLogRepository, AuditLogRow } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function toRow(row: {
  id: string;
  organizationId: string | null;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): AuditLogRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

export function auditLogRepository(client: DbClient): AuditLogRepository {
  return {
    async append(params) {
      const row = await client.auditLog.create({
        data: {
          organizationId: params.organizationId ?? null,
          userId: params.userId,
          action: params.action,
          targetType: params.targetType ?? null,
          targetId: params.targetId ?? null,
          metadata: (params.metadata ?? null) as never,
        },
      });
      return toRow(row as never);
    },

    async listForOrg(organizationId, limit, offset) {
      const rows = await client.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });
      return rows.map((r) => toRow(r as never));
    },
  };
}