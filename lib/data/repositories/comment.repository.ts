import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client/client.ts";
import type { CommentRepository, CommentRow } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function toRow(row: { id: string; diagramId: string; authorId: string; text: string; x: number; y: number; createdAt: Date }): CommentRow {
  return {
    id: row.id,
    diagramId: row.diagramId,
    authorId: row.authorId,
    text: row.text,
    x: row.x,
    y: row.y,
    createdAt: row.createdAt.toISOString(),
  };
}

export function commentRepository(client: DbClient): CommentRepository {
  return {
    async list(diagramId, userId) {
      // Must own the diagram (via project) to see its comments
      const diagram = await client.diagram.findFirst({ where: { id: diagramId, project: { userId } }, select: { id: true } });
      if (!diagram) return [];
      const rows = await client.comment.findMany({ where: { diagramId }, orderBy: { createdAt: "asc" } });
      return (rows as unknown as Parameters<typeof toRow>[0][]).map((r) => toRow(r));
    },

    async create(diagramId, authorId, text, x, y) {
      const diagram = await client.diagram.findFirst({ where: { id: diagramId, project: { userId: authorId } }, select: { id: true } });
      if (!diagram) throw new Error("Not found or not yours");
      const row = await client.comment.create({ data: { diagramId, authorId, text, x, y } });
      return toRow(row as never);
    },

    async delete(id, userId) {
      const existing = await client.comment.findFirst({ where: { id }, select: { authorId: true, diagramId: true } });
      if (!existing) return;
      // Author or diagram owner may delete
      if (existing.authorId !== userId) {
        const diagram = await client.diagram.findFirst({ where: { id: existing.diagramId, project: { userId } }, select: { id: true } });
        if (!diagram) throw new Error("Not found or not yours");
      }
      await client.comment.delete({ where: { id } });
    },
  };
}