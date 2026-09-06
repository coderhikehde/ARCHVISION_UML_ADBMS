import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma/client/client.ts";
import type { ValidationRepository, ValidationReportRow } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export function validationRepository(client: DbClient): ValidationRepository {
  return {
    async latest(diagramId, userId) {
      const row = await client.validationReport.findFirst({
        where: { diagramId, diagram: { project: { userId } } },
        orderBy: { createdAt: "desc" },
      });
      if (!row) return null;
      return {
        issues: (row.issues as unknown as ValidationReportRow["issues"]) ?? [],
        score: row.score,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async save(diagramId, report) {
      await client.validationReport.create({
        data: {
          diagramId,
          issues: report.issues as object[],
          score: report.score,
        },
      });
    },

    async updateDiagramFlags(diagramId, userId, flags) {
      await client.diagram.updateMany({
        where: { id: diagramId, project: { userId } },
        data: {
          isValid: flags.isValid,
          validationScore: flags.validationScore,
          updatedAt: new Date(),
        },
      });
    },
  };
}