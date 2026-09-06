import type { Repositories, VersionRow } from "@/lib/data/repositories/types";
import { UniqueConflictError } from "@/lib/data/repositories/types";
import { NotFoundError } from "@/lib/http/api-error";

/**
 * VersionService — bounded context: version snapshots.
 *
 * Business rules owned here:
 *   - version numbers are MONOTONIC and computed by the server: next =
 *     max(existing) + 1, read inside the same transaction that inserts.
 *     The caller's `version` field is advisory and ignored.
 *   - the (diagramId, version) DB unique constraint is the race backstop:
 *     if two concurrent saves both compute the same next number, the
 *     insert hits P2002 -> UniqueConflictError -> the service retries with
 *     a fresh number (up to MAX_ATTEMPTS). Without this, racing clients
 *     could produce duplicate version numbers.
 *   - version insert + change-log entry commit in one transaction.
 */

const MAX_ATTEMPTS = 3;

export interface VersionCreateInput {
  label: string;
  mermaidCode: string;
  summary: string;
  changes: string[];
}

export class VersionService {
  private readonly repos: Repositories;

  constructor(repos: Repositories) {
    this.repos = repos;
  }

  async list(
    diagramId: string,
    userId: string,
    pagination?: { limit?: number; offset?: number }
  ): Promise<VersionRow[]> {
    return this.repos.versions.list(diagramId, userId, pagination?.limit, pagination?.offset);
  }

  /** Snapshot the current code as the next version. Returns the assigned version number. */
  async save(diagramId: string, input: VersionCreateInput, userId: string): Promise<number> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.repos.withTransaction(async (tx) => {
          await tx.diagrams.requireOwned(diagramId, userId);
          const latest = await tx.versions.latest(diagramId);
          const next = (latest?.version ?? 0) + 1;
          await tx.versions.create({
            diagramId,
            version: next,
            label: input.label,
            mermaidCode: input.mermaidCode,
            summary: input.summary,
            changes: input.changes,
          });
          await tx.diagrams.recordChange(diagramId, input.summary);
          return next;
        });
      } catch (error) {
        if (error instanceof UniqueConflictError && attempt < MAX_ATTEMPTS - 1) {
          // Concurrent save grabbed our number — recompute and retry.
          continue;
        }
        throw error;
      }
    }
    // Unreachable (loop always returns or throws), satisfies TS exhaustiveness.
    throw new NotFoundError();
  }
}