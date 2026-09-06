import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma/client/client.ts";
import type { Repositories } from "./types";
import { projectRepository } from "./project.repository";
import { diagramRepository } from "./diagram.repository";
import { versionRepository } from "./version.repository";
import { validationRepository } from "./validation.repository";
import { idempotencyRepository } from "./idempotency.repository";
import { orgRepository } from "./org.repository";
import { auditLogRepository } from "./audit-log.repository";
import { commentRepository } from "./comment.repository";
import { adrRepository } from "./adr.repository";

/**
 * Repository factory — the ONLY place that talks to Prisma.
 *
 * `createRepositories(client)` binds every persistence port to a client.
 * Pass the application PrismaClient for normal use, or a
 * $transaction-scoped client for atomic multi-write operations. The
 * `withTransaction` member on the returned aggregate does exactly that:
 * it runs a callback with transaction-scoped repositories so services
 * like DiagramService.create can do
 *   diagram insert + first version insert + project touch
 * as ONE atomic unit instead of three unguarded sequential writes.
 *
 * Persistence only: no business rules, no seeding, no demo data — that
 * lives in lib/data/seed.ts now.
 */

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function createRepositories(client: DbClient): Repositories {
  return {
    projects: projectRepository(client),
    diagrams: diagramRepository(client),
    versions: versionRepository(client),
    validation: validationRepository(client),
    idempotency: idempotencyRepository(client),
    orgs: orgRepository(client),
    auditLogs: auditLogRepository(client),
    comments: commentRepository(client),
    adrs: adrRepository(client),
    withTransaction: <T>(fn: (tx: Repositories) => Promise<T>): Promise<T> =>
      client.$transaction(async (tx) => fn(createRepositories(tx as DbClient))),
  };
}

export * from "./types";