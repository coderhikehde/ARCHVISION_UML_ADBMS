import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma/client/client.ts";
import type {
  DiagramRepository,
  DiagramRow,
  DiagramPatch,
  DiagramCreateData,
  PromptHistoryRow,
  ChangeRow,
} from "./types";
import { NotFoundError } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function toDiagramRow(row: {
  id: string;
  name: string;
  type: "CLASS" | "SEQUENCE" | "USE_CASE" | "STATE" | "ACTIVITY" | "COMPONENT" | "DEPLOYMENT" | "ER" | "PACKAGE";
  projectId: string;
  mermaidCode: string;
  viewMode: "EXECUTIVE" | "ENGINEERING";
  isValid: boolean;
  validationScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}): DiagramRow {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    projectId: row.projectId,
    mermaidCode: row.mermaidCode,
    viewMode: row.viewMode,
    isValid: row.isValid,
    validationScore: row.validationScore,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function diagramRepository(client: DbClient): DiagramRepository {
  return {
    async list(projectId, userId, limit, offset) {
      const rows = await client.diagram.findMany({
        where: { projectId: projectId ?? undefined, project: { userId } },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      });
      return rows.map(toDiagramRow);
    },

    async get(id, userId) {
      const row = await client.diagram.findFirst({
        where: { id, project: { userId } },
      });
      return row ? toDiagramRow(row) : null;
    },

    async create(data: DiagramCreateData) {
      const row = await client.diagram.create({
        data: {
          id: data.id,
          name: data.name,
          type: data.type,
          projectId: data.projectId,
          mermaidCode: data.mermaidCode,
          viewMode: data.viewMode,
          isValid: data.isValid,
          validationScore: data.validationScore,
        },
      });
      return toDiagramRow(row);
    },

    async update(id, patch: DiagramPatch, userId, expectedUpdatedAt) {
      // Conditional write: the optimistic-concurrency token is part of the
      // WHERE clause, so check-and-update is one atomic statement.
      const result = await client.diagram.updateMany({
        where: {
          id,
          project: { userId },
          ...(expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}),
        },
        data: { ...patch, updatedAt: new Date() },
      });
      if (result.count === 0) return null;
      const row = await client.diagram.findFirst({
        where: { id, project: { userId } },
      });
      return row ? toDiagramRow(row) : null;
    },

    async deleteCascade(id) {
      // Explicit cascade: child rows are removed in a deterministic order
      // BEFORE the diagram itself. The schema's onDelete: Cascade FKs stay
      // as a backstop for any future child tables we might forget here.
      await client.promptHistory.deleteMany({ where: { diagramId: id } });
      await client.validationReport.deleteMany({ where: { diagramId: id } });
      await client.export.deleteMany({ where: { diagramId: id } });
      await client.diagramVersion.deleteMany({ where: { diagramId: id } });
      await client.diagramChangeLog.deleteMany({ where: { diagramId: id } });
      await client.diagram.delete({ where: { id } });
    },

    async requireOwned(id, userId) {
      const row = await client.diagram.findFirst({
        where: { id, project: { userId } },
        select: { id: true },
      });
      if (!row) throw new NotFoundError();
    },

    async recordPrompt(diagramId, entry) {
      await client.promptHistory.create({
        data: {
          diagramId,
          prompt: entry.prompt,
          response: entry.response,
          actionType: entry.actionType,
        },
      });
    },

    async listPromptHistory(diagramId, userId, limit, offset) {
      const rows = await client.promptHistory.findMany({
        where: { diagramId, diagram: { project: { userId } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });
      return rows.map((row): PromptHistoryRow => ({
        id: row.id,
        diagramId: row.diagramId,
        prompt: row.prompt,
        response: row.response,
        actionType: row.actionType as PromptHistoryRow["actionType"],
        createdAt: row.createdAt.toISOString(),
      }));
    },

    async recordChange(diagramId, summary) {
      await client.diagramChangeLog.create({ data: { diagramId, summary } });
    },

    async listChanges(diagramId, userId, limit, offset) {
      const rows = await client.diagramChangeLog.findMany({
        where: { diagramId, diagram: { project: { userId } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });
      return rows.map((row): ChangeRow => ({
        at: row.createdAt.toISOString(),
        summary: row.summary,
      }));
    },
  };
}