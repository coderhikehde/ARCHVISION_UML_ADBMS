import { randomUUID } from "crypto";
import { z } from "zod";
import { callerKey, getRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import {
  ApiError,
  BadRequestError,
  RateLimitedError,
  UnauthorizedError,
} from "./api-error";
import { createLogger, hashUserId, type Logger } from "./logger";

/**
 * withApiHandler — the single HTTP pipeline every route goes through.
 *
 * Order of operations, in exactly this sequence:
 *   1. request ID: propagate `x-request-id` or mint a UUID
 *   2. structured logger scoped to that request ID
 *   3. auth (required -> 401 when missing; optional -> user may be null)
 *   4. rate limiting (per-route key, per-caller; 429 + Retry-After)
 *   5. body / query validation with zod (400 + field-level details)
 *   6. the controller itself — business logic lives in services, never here
 *   7. response: `{ ok: true, data }` wrapped by ctx.json(), or any Response
 *      the controller chooses (e.g. an SSE stream)
 *   8. error mapping: ApiError subclasses -> status + `{ ok: false, error:
 *      { code, message, requestId, details? } }`; unknown errors -> logged
 *      with stack + request ID, reported to the error webhook (if
 *      configured), and mapped to a generic 500 that never leaks internals
 *   9. one structured JSON log line per request (method, path, status,
 *      duration, hashed userId, request ID) — the observability contract
 *
 * The pipeline itself lives in `createApiHandler`, which takes the session
 * resolver as a dependency — so tests can drive the full pipeline (auth,
 * rate limits, validation, error mapping) without a NextAuth setup. The
 * `withApiHandler` default binding wires the real auth resolver (lazily
 * imported so test environments never pull in next/server).
 *
 * Test hooks: `__setAuthResolverForTests` / `__setRateLimiterForTests`
 * replace the auth + rate-limit providers so integration tests can
 * simulate sessions and force 429s.
 */

export interface HandlerOptions {
  /** Auth requirement. Defaults to "optional". */
  auth?: "required" | "optional";
  /** Per-route rate limit window, keyed per caller (user or IP). */
  rateLimit?: { key: string; limit: number; windowMs: number };
  /** Zod schema applied to the JSON body before the controller runs. */
  bodySchema?: z.ZodType;
  /** Zod schema applied to the parsed query string. */
  querySchema?: z.ZodType;
  /** Response is a stream (SSE): body is not parsed, stream completion is logged. */
  stream?: boolean;
  /** Route label used in log lines. */
  name?: string;
}

export interface HandlerContext<Q = Record<string, string | undefined>> {
  request: Request;
  /** Dynamic route params, e.g. { diagramId } — already validated to exist by Next. */
  params: Record<string, string>;
  /** Raw query string values. Use `parsePagination` / schema types for typed reads. */
  query: Q;
  /** Parsed + validated query when `querySchema` is configured. */
  queryData: unknown;
  /** Authenticated session user, or null when auth is optional and absent. */
  user: { id: string } | null;
  requestId: string;
  log: Logger;
  header(name: string): string | null;
  /** Parsed JSON body (validated when `bodySchema` is configured). */
  body<T = unknown>(): Promise<T>;
  /** Wrap any payload as { ok: true, data } — the client facade contract. */
  json(data: unknown, init?: { status?: number; headers?: Record<string, string> }): Response;
}

export type Controller<Q = Record<string, string | undefined>> = (
  ctx: HandlerContext<Q>
) => Promise<Response>;

type SessionShape = { user?: { id?: string } | null } | null;
export type SessionResolver = () => Promise<SessionShape>;

let authOverride: SessionResolver | null = null;
let rateLimiterOverride: RateLimiter | null = null;

/** TEST ONLY — replaces the NextAuth session resolver. */
export function __setAuthResolverForTests(resolver: SessionResolver | null): void {
  authOverride = resolver;
}

/** TEST ONLY — replaces the rate limiter (e.g. to force 429s deterministically). */
export function __setRateLimiterForTests(limiter: RateLimiter | null): void {
  rateLimiterOverride = limiter;
}

/** Real session resolver — lazy import keeps tests free of next/server. */
async function resolveAuthSession(): Promise<SessionShape> {
  const { auth } = await import("@/lib/auth");
  return (await auth()) as SessionShape;
}

function errorJson(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown
): Response {
  return Response.json(
    { ok: false, error: { code, message, requestId, ...(details !== undefined ? { details } : {}) } },
    { status }
  );
}

function reportErrorToWebhook(error: unknown, ctx: {
  requestId: string;
  path: string;
  method: string;
  userId: string | null;
}): void {
  const url = process.env.ERROR_REPORTING_URL;
  if (!url) return;
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? (error.stack ?? undefined) : undefined;
  // Best-effort, fire-and-forget: error reporting must never block the response.
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "api.error",
      requestId: ctx.requestId,
      path: ctx.path,
      method: ctx.method,
      userId: ctx.userId ? hashUserId(ctx.userId) : null,
      message,
      stack,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => undefined);
}

export function createApiHandler<Q = Record<string, string | undefined>>(
  sessionResolver: SessionResolver,
  controller: Controller<Q>,
  options: HandlerOptions = {}
): (request: Request, routeContext?: { params?: Record<string, string> }) => Promise<Response> {
  return async (request, routeContext): Promise<Response> => {
    const startedAt = Date.now();
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const log = createLogger(requestId);
    const params = routeContext?.params ?? {};
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const routeName = options.name ?? `${method} ${path}`;

    const fail = (error: unknown): Response => {
      const durationMs = Date.now() - startedAt;
      if (error instanceof ApiError) {
        log.warn("request failed", {
          method,
          path,
          status: error.status,
          code: error.code,
          durationMs,
        });
        const response =
          error instanceof RateLimitedError
            ? errorJson(error.status, error.code, error.message, requestId, undefined)
            : errorJson(error.status, error.code, error.message, requestId, error.details);
        if (error instanceof RateLimitedError) {
          response.headers.set("Retry-After", String(error.retryAfter));
        }
        response.headers.set("x-request-id", requestId);
        return response;
      }
      // Unknown error: log the full stack, report, and return a generic 500.
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error("unhandled error", { method, path, error: message, stack: error instanceof Error ? error.stack : undefined });
      reportErrorToWebhook(error, { requestId, path, method, userId: null });
      const response = errorJson(500, "internal", "Internal server error", requestId);
      response.headers.set("x-request-id", requestId);
      return response;
    };

    // 1–2: request id + logger are already in scope.

    // 3: auth
    let session: SessionShape = null;
    try {
      session = await sessionResolver();
    } catch (error) {
      return fail(error);
    }
    const user = session?.user?.id ? { id: session.user.id } : null;
    if (options.auth === "required" && !user) {
      return fail(new UnauthorizedError());
    }

    // 4: rate limiting
    if (options.rateLimit) {
      const limiter = rateLimiterOverride ?? getRateLimiter();
      const key = `${options.rateLimit.key}:${callerKey(user?.id, request)}`;
      try {
        const result = await limiter.check(key, options.rateLimit.limit, options.rateLimit.windowMs);
        if (!result.ok) {
          return fail(new RateLimitedError(result.retryAfter));
        }
      } catch (error) {
        // A limiter failure must not take the API down — log and continue
        // (fail-open) so a broken Redis never becomes an availability issue.
        log.warn("rate limiter failure — continuing without limiting", { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 5: body / query validation
    let bodyData: unknown;
    let queryData: unknown;
    const rawQuery: Record<string, string | undefined> = {};
    for (const [key, value] of url.searchParams) {
      rawQuery[key] = value;
    }
    if (options.querySchema) {
      const parsed = options.querySchema.safeParse(rawQuery);
      if (!parsed.success) {
        return fail(new BadRequestError("Invalid query parameters", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))));
      }
      queryData = parsed.data;
    }
    if (!options.stream && options.bodySchema) {
      try {
        bodyData = options.bodySchema.parse(await request.json());
      } catch (error) {
        if (error instanceof z.ZodError) {
          return fail(new BadRequestError("Invalid request body", error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))));
        }
        return fail(new BadRequestError("Invalid JSON body"));
      }
    }

    // 6–7: controller
    const ctx: HandlerContext<Q> = {
      request,
      params,
      query: rawQuery as Q,
      queryData,
      user,
      requestId,
      log,
      header: (name) => request.headers.get(name),
      body: async <T = unknown>(): Promise<T> => {
        if (bodyData !== undefined) return bodyData as T;
        try {
          return (await request.json()) as T;
        } catch {
          throw new BadRequestError("Invalid JSON body");
        }
      },
      json: (data, init) => {
        const response = Response.json({ ok: true, data }, { status: init?.status ?? 200 });
        if (init?.headers) {
          for (const [key, value] of Object.entries(init.headers)) {
            response.headers.set(key, value);
          }
        }
        return response;
      },
    };

    let response: Response;
    try {
      response = await controller(ctx);
    } catch (error) {
      return fail(error);
    }

    // 8–9: log + attach the request id for client-side correlation.
    const durationMs = Date.now() - startedAt;
    log.info("request completed", {
      method,
      path,
      status: response.status,
      durationMs,
      userId: user ? hashUserId(user.id) : null,
      route: routeName,
    });
    response.headers.set("x-request-id", requestId);

    if (options.stream && response.body) {
      // Log stream completion so long-running SSE requests are observable.
      const tracker = new TransformStream<Uint8Array, Uint8Array>({
        flush() {
          log.info("stream completed", { method, path, route: routeName, durationMs: Date.now() - startedAt });
        },
      });
      return new Response(response.body.pipeThrough(tracker), response);
    }

    return response;
  };
}

export function withApiHandler<Q = Record<string, string | undefined>>(
  controller: Controller<Q>,
  options: HandlerOptions = {}
): (request: Request, routeContext?: { params?: Record<string, string> }) => Promise<Response> {
  const resolver: SessionResolver = async () =>
    authOverride ? await authOverride() : await resolveAuthSession();
  return createApiHandler(resolver, controller, options);
}