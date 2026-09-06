import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma/client/client.ts";
import type { ProjectRepository, ProjectRow } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function toProjectRow(row: {
  id: string;
  name: string;
  description: string | null;
  githubRepo: string | null;
  githubBranch: string;
  lastSyncedAt: Date | null;
  syncing: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { diagrams: number };
}): ProjectRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    githubRepo: row.githubRepo,
    githubBranch: row.githubBranch,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    syncing: row.syncing,
    diagramCount: row._count.diagrams,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function projectRepository(client: DbClient): ProjectRepository {
  return {
    async list(userId, limit, offset) {
      const rows = await client.project.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { diagrams: true } } },
        take: limit,
        skip: offset,
      });
      return rows.map(toProjectRow);
    },

    async countByUser(userId) {
      return client.project.count({ where: { userId } });
    },

    async findOwned(id, userId) {
      const row = await client.project.findFirst({
        where: { id, userId },
        include: { _count: { select: { diagrams: true } } },
      });
      return row ? toProjectRow(row) : null;
    },

    async create(input, userId) {
      const row = await client.project.create({
        data: {
          id: input.id,
          name: input.name,
          description: input.description,
          githubRepo: null,
          githubBranch: "main",
          userId,
        },
        include: { _count: { select: { diagrams: true } } },
      });
      return toProjectRow(row);
    },

    async touch(id) {
      await client.project.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    },

    async remove(id) {
      // Diagram → Project is onDelete: Cascade, so every diagram and its
      // child rows (prompts, reports, versions, change log, exports) are
      // removed by the database in the same statement.
      await client.project.delete({ where: { id } });
    },
  };
}