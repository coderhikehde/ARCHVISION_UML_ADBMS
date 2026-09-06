/**
 * Pagination helpers for list endpoints.
 *
 * Convention: list routes accept `limit` + `offset` query params, return
 * plain arrays (kept compatible with the existing client facade), and
 * expose the total via the X-Total-Count response header.
 */

export interface PageParams {
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Parse and clamp user-supplied pagination values. */
export function parsePagination(query: {
  limit?: unknown;
  offset?: unknown;
}, defaults: { limit?: number; max?: number } = {}): PageParams {
  const max = defaults.max ?? MAX_LIMIT;
  const defaultLimit = defaults.limit ?? DEFAULT_LIMIT;
  const rawLimit = typeof query.limit === "string" ? Number(query.limit) : NaN;
  const rawOffset = typeof query.offset === "string" ? Number(query.offset) : NaN;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.trunc(rawLimit)), max) : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0;
  return { limit, offset };
}

export function totalCountHeader(count: number): Record<string, string> {
  return { "X-Total-Count": String(count) };
}