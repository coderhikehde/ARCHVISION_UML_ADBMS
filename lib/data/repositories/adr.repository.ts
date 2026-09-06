import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client/client.ts";
import type { AdrRepository, AdrRow } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function toRow(row: {
  id: string;
  diagramId: string;
  number: number;
  title: string;
  status: string;
  context: string;
  decision: string;
  consequences: string;
  linkedNodes: unknown;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}): AdrRow {
  return {
    id: row.id,
    diagramId: row.diagramId,
    number: row.number,
    title: row.title,
    status: row.status,
    context: row.context,
    decision: row.decision,
    consequences: row.consequences,
    linkedNodes: (row.linkedNodes as string[]) ?? [],
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function adrRepository(client: DbClient): AdrRepository {
  return {
    async list(diagramId, userId) {
      const diagram = await client.diagram.findFirst({ where: { id: diagramId, project: { userId } }, select: { id: true } });
      if (!diagram) return [];
      const rows = await client.adr.findMany({ where: { diagramId }, orderBy: { number: "desc" } });
      return rows.map((r) => toRow(r as never));
    },

    async create(diagramId, authorId, data) {
      const diagram = await client.diagram.findFirst({ where: { id: diagramId, project: { userId: authorId } }, select: { id: true } });
      if (!diagram) throw new Error("Not found or not yours");
      // Auto-number: max + 1
      const max = await client.adr.findFirst({ where: { diagramId }, orderBy: { number: "desc" }, select: { number: true } });
      const number = (max?.number ?? 0) + 1;
      const row = await client.adr.create({
        data: {
          diagramId,
          number,
          title: data.title,
          status: data.status,
          context: data.context,
          decision: data.decision,
          consequences: data.consequences,
          linkedNodes: data.linkedNodes as unknown as Prisma.InputJsonValue,
          authorId,
        },
      });
      return toRow(row as never);
    },

    async update(id, userId, patch) {
      const existing = await client.adr.findFirst({ where: { id }, select: { diagramId: true, authorId: true } });
      if (!existing) return null;
      // Author or diagram owner may edit
      if (existing.authorId !== userId) {
        const diagram = await client.diagram.findFirst({ where: { id: existing.diagramId, project: { userId } }, select: { id: true } });
        if (!diagram) throw new Error("Not found or not yours");
      }
      const row = await client.adr.update({
        where: { id },
        data: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.context !== undefined ? { context: patch.context } : {}),
          ...(patch.decision !== undefined ? { decision: patch.decision } : {}),
          ...(patch.consequences !== undefined ? { consequences: patch.consequences } : {}),
          ...(patch.linkedNodes !== undefined ? { linkedNodes: patch.linkedNodes as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      return toRow(row as never);
    },

    async delete(id, userId) {
      const existing = await client.adr.findFirst({ where: { id }, select: { authorId: true, diagramId: true } });
      if (!existing) return;
      if (existing.authorId !== userId) {
        const diagram = await client.diagram.findFirst({ where: { id: existing.diagramId, project: { userId } }, select: { id: true } });
        if (!diagram) throw new Error("Not found or not yours");
      }
      await client.adr.delete({ where: { id } });
    },
  };
}