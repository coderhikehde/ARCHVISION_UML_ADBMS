/**
 * Rate limiting behind a swappable interface.
 *
 *   RATE_LIMITER=upstash   -> UpstashRateLimiter (Redis, horizontally safe)
 *   otherwise (default)    -> InMemoryRateLimiter (single-instance dev)
 *
 * IMPORTANT (in-memory): state lives in this process only. Multiple
 * instances share no counter, and a deploy resets all windows. Fine for
 * local development and single-instance deployments; NOT safe for
 * horizontal scaling — use the Upstash implementation in production.
 */

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
}

export interface RateLimiter {
  /** Sliding window: allow `limit` calls per `windowMs`. Async so Redis-backed implementations can be swapped in. */
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/* ----------------------------- in-memory ----------------------------- */

const globalForRateLimit = globalThis as unknown as {
  __rateLimitBuckets?: Map<string, number[]>;
};

function buckets(): Map<string, number[]> {
  if (!globalForRateLimit.__rateLimitBuckets) {
    globalForRateLimit.__rateLimitBuckets = new Map<string, number[]>();
  }
  return globalForRateLimit.__rateLimitBuckets;
}

function checkInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const map = buckets();
  const windowStart = now - windowMs;
  const hits = (map.get(key) ?? []).filter((t) => t > windowStart);

  if (hits.length >= limit) {
    map.set(key, hits);
    const oldest = hits[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfter };
  }

  hits.push(now);
  map.set(key, hits);

  // Opportunistic cleanup of expired keys to avoid unbounded growth.
  if (map.size > 10_000) {
    for (const [k, ts] of map) {
      if (ts.length === 0 || ts[ts.length - 1]! <= windowStart) map.delete(k);
    }
  }
  return { ok: true, retryAfter: 0 };
}

export class InMemoryRateLimiter implements RateLimiter {
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    return checkInMemory(key, limit, windowMs);
  }
}

/* ----------------------------- Upstash ----------------------------- */

interface UpstashCommandResult {
  result: unknown;
  error?: string;
}

/**
 * Redis sliding window via the Upstash REST API (no driver dependency).
 * Uses a sorted set per key: members are timestamps, score = timestamp.
 * Window trimmed with ZREMRANGEBYSCORE, count with ZCARD, insert with
 * ZADD; a TTL keeps stale keys from accumulating.
 */
export class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly ttlSeconds = 3600
  ) {}

  private async command(...args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      throw new Error(`Upstash rate limiter request failed: ${res.status}`);
    }
    const data = (await res.json()) as UpstashCommandResult;
    if (data.error) {
      throw new Error(`Upstash rate limiter error: ${data.error}`);
    }
    return data.result;
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Trim the window then count — the score range is exclusive on the low
    // side so `now - windowMs` cutoff behaves like the in-memory limiter.
    await this.command("zremrangebyscore", key, 0, windowStart);
    const count = (await this.command("zcard", key)) as number;

    if (count >= limit) {
      const oldest = (await this.command("zrange", key, 0, 0, "WITHSCORES")) as string[];
      const oldestTs = oldest.length >= 2 ? Number(oldest[1]) : now;
      const retryAfter = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));
      return { ok: false, retryAfter };
    }

    await this.command("zadd", key, now, now);
    await this.command("expire", key, this.ttlSeconds);
    return { ok: true, retryAfter: 0 };
  }
}

/* ----------------------------- selection ----------------------------- */

let cached: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (cached) return cached;
  const mode = process.env.RATE_LIMITER ?? "memory";
  if (mode === "upstash") {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "RATE_LIMITER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"
      );
    }
    cached = new UpstashRateLimiter(url, token);
  } else {
    cached = new InMemoryRateLimiter();
  }
  return cached;
}

/** Best-effort caller key: session user id, falling back to the client IP. */
export function callerKey(userId: string | undefined, request: Request): string {
  if (userId) return `user:${userId}`;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `ip:${ip}`;
}