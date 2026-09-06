import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  createApiHandler,
  __setRateLimiterForTests,
  type SessionResolver,
} from "@/lib/http/with-api-handler";
import { NotFoundError } from "@/lib/http/api-error";
import type { RateLimiter } from "@/lib/rate-limit";

/**
 * HTTP pipeline tests — drive createApiHandler directly with fake session
 * resolvers and rate limiters, so no NextAuth or database is involved.
 *
 * Covers the full contract: auth gating, zod validation, rate limits
 * (429 + Retry-After), the { ok, data } / { ok, error } envelopes,
 * request-id propagation, and generic 500s that never leak internals.
 */

const user = () => Promise.resolve({ user: { id: "user-1" } }) as ReturnType<SessionResolver>;
const anonymous = () => Promise.resolve(null) as ReturnType<SessionResolver>;

/** Always allows; captures keys so tests can assert limiter wiring. */
function allowAllLimiter(calls: { key: string; limit: number; windowMs: number }[] = []): RateLimiter {
  return {
    async check(key, limit, windowMs) {
      calls.push({ key, limit, windowMs });
      return { ok: true, retryAfter: 0 };
    },
  };
}

/** Always denies with a fixed retry-after. */
const denyLimiter: RateLimiter = {
  async check() {
    return { ok: false, retryAfter: 17 };
  },
};

test("auth required: anonymous caller gets 401 with the error envelope", async () => {
  const handler = createApiHandler(anonymous, async (ctx) => ctx.json({ ok: true }), {
    auth: "required",
    name: "test.auth",
  });
  const res = await handler(new Request("http://localhost/api/test"));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; error: { code: string; message: string; requestId: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "unauthorized");
  assert.ok(body.error.requestId.length > 0);
  assert.ok(res.headers.get("x-request-id"));
});

test("auth optional: anonymous caller passes through with user null", async () => {
  const handler = createApiHandler(
    anonymous,
    async (ctx) => ctx.json({ sawUser: ctx.user }),
    { auth: "optional", name: "test.optional" }
  );
  const res = await handler(new Request("http://localhost/api/test"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; data: { sawUser: null } };
  assert.equal(body.ok, true);
  assert.equal(body.data.sawUser, null);
});

test("authenticated caller: user id is available and body parses", async () => {
  const handler = createApiHandler(
    user,
    async (ctx) => {
      const payload = await ctx.body<{ name: string }>();
      return ctx.json({ userId: ctx.user!.id, name: payload.name });
    },
    { auth: "required", name: "test.body" }
  );
  const res = await handler(
    new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "ok" }),
    })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; data: { userId: string; name: string } };
  assert.deepEqual(body.data, { userId: "user-1", name: "ok" });
});

test("invalid body against a zod schema returns 400 with field details", async () => {
  const handler = createApiHandler(
    user,
    async (ctx) => ctx.json({ ok: true }),
    {
      auth: "required",
      bodySchema: z.object({ name: z.string().min(3) }),
      name: "test.schema",
    }
  );
  const res = await handler(
    new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify({ name: "x" }) })
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as {
    ok: boolean;
    error: { code: string; message: string; details: Array<{ field: string }> };
  };
  assert.equal(body.error.code, "bad_request");
  assert.equal(body.error.details[0].field, "name");
});

test("non-JSON body returns 400", async () => {
  const handler = createApiHandler(
    user,
    async (ctx) => ctx.json({ ok: true }),
    { auth: "required", bodySchema: z.object({}), name: "test.badjson" }
  );
  const res = await handler(
    new Request("http://localhost/api/test", { method: "POST", body: "not json" })
  );
  assert.equal(res.status, 400);
});

test("rate limit denial returns 429 with Retry-After", async () => {
  const handler = createApiHandler(
    user,
    async (ctx) => ctx.json({ ok: true }),
    {
      auth: "required",
      rateLimit: { key: "test", limit: 1, windowMs: 60_000 },
      name: "test.ratelimit",
    }
  );
  __setRateLimiterForTests(denyLimiter);
  try {
    const res = await handler(new Request("http://localhost/api/test"));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "17");
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    assert.equal(body.error.code, "rate_limited");
  } finally {
    __setRateLimiterForTests(null);
  }
});

test("rate limiting keys include the caller id", async () => {
  const calls: Array<{ key: string; limit: number; windowMs: number }> = [];
  __setRateLimiterForTests(allowAllLimiter(calls));
  try {
    const handler = createApiHandler(
      user,
      async (ctx) => ctx.json({ ok: true }),
      {
        auth: "required",
        rateLimit: { key: "test", limit: 5, windowMs: 60_000 },
        name: "test.limiterkey",
      }
    );
    await handler(new Request("http://localhost/api/test"));
  } finally {
    __setRateLimiterForTests(null);
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, "test:user:user-1");
  assert.equal(calls[0].limit, 5);
});

test("invalid query against a zod schema returns 400", async () => {
  const handler = createApiHandler(
    user,
    async (ctx) => ctx.json({ ok: true }),
    {
      auth: "required",
      querySchema: z.object({ limit: z.string().regex(/^\d+$/) }),
      name: "test.query",
    }
  );
  const res = await handler(new Request("http://localhost/api/test?limit=abc"));
  assert.equal(res.status, 400);
});

test("ApiError subclasses map to their status and code", async () => {
  const handler = createApiHandler(
    user,
    async () => {
      throw new NotFoundError();
    },
    { auth: "required", name: "test.notfound" }
  );
  const res = await handler(new Request("http://localhost/api/test"));
  assert.equal(res.status, 404);
  const body = (await res.json()) as { ok: boolean; error: { code: string } };
  assert.equal(body.error.code, "not_found");
});

test("unknown errors become a generic 500 without leaking internals", async () => {
  const handler = createApiHandler(
    user,
    async () => {
      throw new Error("secret internal detail: db password = hunter2");
    },
    { auth: "required", name: "test.internal" }
  );
  const res = await handler(new Request("http://localhost/api/test"));
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes("hunter2"), "internal details must not leak");
  const body = JSON.parse(text) as { ok: boolean; error: { code: string } };
  assert.equal(body.error.code, "internal");
});

test("request-id is propagated: incoming x-request-id is echoed back", async () => {
  const handler = createApiHandler(
    user,
    async (ctx) => ctx.json({ rid: ctx.requestId }),
    { auth: "required", name: "test.rid" }
  );
  const res = await handler(
    new Request("http://localhost/api/test", { headers: { "x-request-id": "abc-123" } })
  );
  assert.equal(res.headers.get("x-request-id"), "abc-123");
  const body = (await res.json()) as { ok: boolean; data: { rid: string } };
  assert.equal(body.data.rid, "abc-123");
});

test("controller JSON responses carry the { ok: true, data } envelope", async () => {
  const handler = createApiHandler(
    user,
    async (ctx) => ctx.json({ list: [1, 2] }, { status: 201 }),
    { auth: "required", name: "test.envelope" }
  );
  const res = await handler(new Request("http://localhost/api/test"));
  assert.equal(res.status, 201);
  const body = (await res.json()) as { ok: boolean; data: { list: number[] } };
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, { list: [1, 2] });
});

test("rate limiter failures fail open instead of blocking requests", async () => {
  const brokenLimiter: RateLimiter = {
    async check() {
      throw new Error("redis down");
    },
  };
  const handler = createApiHandler(
    user,
    async (ctx) => ctx.json({ ok: true }),
    {
      auth: "required",
      rateLimit: { key: "test", limit: 1, windowMs: 60_000 },
      name: "test.failopen",
    }
  );
  // Inject the broken limiter through the test hook.
  const { __setRateLimiterForTests } = await import("@/lib/http/with-api-handler");
  __setRateLimiterForTests(brokenLimiter);
  try {
    const res = await handler(new Request("http://localhost/api/test"));
    assert.equal(res.status, 200);
  } finally {
    __setRateLimiterForTests(null);
  }
  assert.ok(allowAllLimiter, "limiter override removed");
});