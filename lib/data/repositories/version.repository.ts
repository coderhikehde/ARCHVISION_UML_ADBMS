import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma/client/client.ts";
import type { VersionRepository, VersionRow, VersionCreateData } from "./types";
import { UniqueConflictError } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function toVersionRow(row: {
  version: number;
  label: string;
  mermaidCode: string;
  summary: string;
  changes: unknown;
  createdAt: Date;
}): VersionRow {
  return {
    version: row.version,
    label: row.label,
    mermaidCode: row.mermaidCode,
    summary: row.summary,
    changes: Array.isArray(row.changes) ? (row.changes as string[]) : [],
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  // Duck-typed Prisma P2002 check — resilient to client generator changes.
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function versionRepository(client: DbClient): VersionRepository {
  return {
    async list(diagramId, userId, limit, offset) {
      const rows = await client.diagramVersion.findMany({
        where: { diagramId, diagram: { project: { userId } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });
      return rows.map(toVersionRow);
    },

    async latest(diagramId) {
      const row = await client.diagramVersion.findFirst({
        where: { diagramId },
        orderBy: { version: "desc" },
      });
      return row ? toVersionRow(row) : null;
    },

    async create(data: VersionCreateData) {
      try {
        await client.diagramVersion.create({
          data: {
            diagramId: data.diagramId,
            version: data.version,
            label: data.label,
            mermaidCode: data.mermaidCode,
            summary: data.summary,
            changes: data.changes,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          // (diagramId, version) unique constraint — two concurrent saves
          // raced to the same number. The service retries with a fresh
          // computed number.
          throw new UniqueConflictError("Version number already taken — retry with the next number");
        }
        throw error;
      }
    },
  };
}