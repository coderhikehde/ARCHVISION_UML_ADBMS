import type { Repositories } from "@/lib/data/repositories/types";
import { UniqueConflictError } from "@/lib/data/repositories/types";

/**
 * IdempotencyService — safe retries for create operations.
 *
 * Clients send an `Idempotency-Key` header (see lib/data/storage.ts —
 * the facade mints one per create call). The service:
 *   1. looks the (userId, key) record up; a hit replays the stored
 *      response WITHOUT re-executing the operation
 *   2. otherwise runs `produce` once and stores the response
 *   3. if two concurrent requests race with the same key, the unique
 *      (userId, key) constraint rejects the second record — the loser
 *      re-reads the winner's stored response instead of duplicating work
 *
 * This makes retried requests (e.g. after the client's 5s DB timeout
 * fallback) safe: the create runs exactly once.
 */

export interface IdempotencyResult<T> {
  /** true when the response came from a previous identical request. */
  replayed: boolean;
  status: number;
  body: T;
}

const RECORD_TTL_MS = 24 * 60 * 60 * 1000; // docs contract: records expire after 24h
const PURGE_PROBABILITY = 0.02; // ~2% of writes also sweep expired rows

export class IdempotencyService {
  private readonly repos: Repositories;

  constructor(repos: Repositories) {
    this.repos = repos;
  }

  async run<T>(
    key: string,
    userId: string,
    produce: () => Promise<{ status: number; body: T }>
  ): Promise<IdempotencyResult<T>> {
    // Opportunistic expiry sweep — keeps the table bounded without a cron.
    if (Math.random() < PURGE_PROBABILITY) {
      try {
        await this.repos.idempotency.purgeOlderThan(new Date(Date.now() - RECORD_TTL_MS));
      } catch {
        // Sweeping is best-effort; never block the request on it.
      }
    }

    const existing = await this.repos.idempotency.find(key, userId);
    if (existing) {
      return { replayed: true, status: existing.status, body: existing.body as T };
    }

    const result = await produce();
    try {
      await this.repos.idempotency.record(key, userId, result);
    } catch (error) {
      if (error instanceof UniqueConflictError) {
        // Lost the race — another request with the same key just recorded.
        // Return ITS stored response so both callers observe one execution.
        const winner = await this.repos.idempotency.find(key, userId);
        if (winner) {
          return { replayed: true, status: winner.status, body: winner.body as T };
        }
      }
      throw error;
    }
    return { replayed: false, status: result.status, body: result.body };
  }
}