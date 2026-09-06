import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma/client/client.ts";
import type { IdempotencyRepository } from "./types";
import { UniqueConflictError } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function idempotencyRepository(client: DbClient): IdempotencyRepository {
  return {
    async find(key, userId) {
      const row = await client.idempotencyRecord.findUnique({
        where: { userId_key: { userId, key } },
      });
      return row ? { status: row.status, body: row.body as unknown } : null;
    },

    async record(key, userId, result) {
      try {
        await client.idempotencyRecord.create({
          data: {
            key,
            userId,
            status: result.status,
            body: result.body as object,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UniqueConflictError("Idempotency key already recorded");
        }
        throw error;
      }
    },

    async purgeOlderThan(cutoff) {
      const result = await client.idempotencyRecord.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return result.count;
    },
  };
}