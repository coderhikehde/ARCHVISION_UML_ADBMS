# Backend Architecture

The backend is a layered, dependency-injected REST API. The frontend never touches
the database directly: the client-side storage facade (`lib/data/storage.ts`) calls
the HTTP API and falls back to localStorage when the API is unreachable.

```
Next.js App Router routes (app/api/**)
        │  thin: parse input, call exactly one service method, shape the response
        ▼
withApiHandler (lib/http/with-api-handler.ts)
        │  session resolution, rate limiting, validation, envelopes, request ids
        ▼
Services (lib/services/*)
        │  business rules, transactions, idempotency, concurrency
        ▼
Repositories (lib/data/repositories/*)
        │  data-shape translation (Prisma ↔ plain DTOs)
        ▼
Prisma (lib/generated/prisma/client)
```

Everything above the Prisma layer is plain TypeScript with no Next.js or Prisma
dependencies, so it is unit-testable with the Node test runner (see `tests/`).

## Request lifecycle

1. **Rate limiting** — a fixed-window in-memory limiter keyed by
   `"{route.key}:{role}:{callerId}"`. Denial returns `429` plus `Retry-After`
   seconds. Per-route limits live in the route's handler options.
2. **Authentication** — `lib/auth` resolves a session (lazy-imported so tests
   never load `next/server`). `auth: "required"` returns `401` when absent;
   `auth: "optional"` passes `null` (e.g. `/api/health`).
3. **Body parsing** — the request body is parsed as JSON and validated against
   the route's zod schema. Zod failures become `400 bad_request` with field
   details (`{ field, message }` entries in `error.details`); unparseable JSON
   is `400 bad_request` "Invalid JSON body".
4. **Controller** — the route's controller runs with a typed `ctx` (userId,
   parsed input, request metadata). Services run their own transactions.
5. **Response** — success uses `ctx.json(data)` producing `{ ok: true, data }`;
   SSE endpoints bypass the envelope for the stream itself.

Every response carries `x-request-id` (client-supplied or minted), which is
included in error envelopes, logs, and webhook reports for correlation.

## Wire contract

- Success: `{ ok: true, data }`.
- Failure: `{ ok: false, error: { code, message, requestId, details? } }`.
- Missing or not-owned resources return `404 not_found` for mutations, but GET
  endpoints that naturally return a single row (`diagram`, validation report)
  return `200` with `data: null` — existence is never leaked.
- Idempotency: POST endpoints accept `Idempotency-Key` (1–128 chars). A replayed
  key returns the stored original response without re-executing the business
  logic. Keys are scoped per user and expire after 24h (see below).
- Pagination: `limit` (1–200) and `offset` (≥0) query params on list endpoints.

### Error taxonomy (`lib/http/api-error.ts`)

| Class            | Status | Code                  | Notes                                  |
| ---------------- | ------ | --------------------- | -------------------------------------- |
| `BadRequestError`| 400    | `bad_request`         | Validation failures carry `details`    |
| `UnauthorizedError` | 401 | `unauthorized`        |                                        |
| `ForbiddenError` | 403    | `forbidden`           | e.g. project quota exhausted           |
| `ApiNotFoundError` | 404 | `not_found`           |                                        |
| `ConflictError`  | 409    | `conflict`            | Stale `expectedUpdatedAt` writes       |
| `RateLimitedError` | 429  | `rate_limited`        | Carries `retryAfter`                   |
| `ValidationError`  | 422  | `unprocessable_entity`|                                        |
| `ServiceUnavailableError` | 503 | `service_unavailable` | e.g. `NEXT_PUBLIC_DATA_MODE !== "db"` |
| `AiUnavailableError` | 502  | `ai_unavailable`      | Client switches to its offline engine  |
| `InternalError`  | 500    | `internal`            | Message is never leaked to clients     |

Repositories raise `RepoNotFoundError`; services translate it to
`ApiNotFoundError` (or `data: null` for optional reads).

## Data model

- `Project` — user-owned; `User.diagrams` count enforced by a per-user quota
  (default 50) in `ProjectService.create`.
- `Diagram` — belongs to a project; carries flags `isValid` and
  `validationScore`. Updates use optimistic concurrency via `expectedUpdatedAt`.
- `DiagramVersion` — immutable snapshots; `(diagramId, version)` is a UNIQUE
  constraint. `VersionService.create` computes `max(version) + 1` inside a
  transaction and retries on unique-violation (racing saves converge).
- `ValidationReport` — latest report per diagram; saving one updates the
  diagram's flags in the same transaction.
- `IdempotencyRecord` — `(userId, key)` unique; stores the original response
  payload and status. Rows older than 24h are purged opportunistically.
- `AiPrompt`, `DiagramChange`, `DiagramExport` — child rows of `Diagram`;
  deletion of a diagram explicitly cascades all of them in one transaction.

## Services

- `ProjectService` — create with quota enforcement, list, touch (updatedAt bump
  used by `DiagramService.create`).
- `DiagramService` — create (atomic diagram + first version snapshot), get,
  list (scoped to the caller), patch with optimistic concurrency, remove
  (owner-only, cascading delete), `recordPrompt`/`recordChange`.
- `VersionService` — monotonic snapshot creation with unique-conflict retry.
- `ValidationService` — save report + diagram flags atomically; latest report.
- `IdempotencyService` — replay/record/expiry for idempotency keys.

## Transactions

Services own transaction boundaries through `db.$transaction(async (tx) => …)`
and must only use repository calls bound to the transaction handle
(`createRepositories(tx)`). No business logic runs outside a transaction where
multi-row writes are involved (create diagram, save validation, delete diagram,
create version).

## Configuration

| Env var                     | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `DATABASE_URL`              | Postgres (Prisma)                              |
| `NEXT_PUBLIC_DATA_MODE`     | `"db"` enables the API-backed storage facade   |
| `NEXTAUTH_URL` / `AUTH_*`   | NextAuth session secret                        |
| `OPENAI_API_KEY`            | AI describe/chat (provider selection)          |
| `ANTHROPIC_API_KEY`         | AI describe/chat fallback provider             |
| `ERROR_REPORTING_URL`       | Out-of-band error reporting                    |
| `DATABASE_MAX_OVERFLOW`     | Prisma pool overflow (optional)                |

## AI endpoints

- `POST /api/ai/describe` — non-streaming; 502 `ai_unavailable` when no provider
  key is configured; the client then uses `lib/ai/offline-engine.ts`.
- `POST /api/ai/chat` — SSE stream with events `meta`, `delta`, `error`, `done`.
  Pre-stream failures (auth, rate limit, schema) return the JSON envelope;
  failures mid-stream emit an SSE `error` event.

## Tests

- `tests/http-pipeline.test.ts` — `createApiHandler` in isolation with fake
  sessions/limiters (no `next/server`).
- `tests/services.unit.test.ts` — services against an in-memory fake repository
  (including a simulated unique-violation race for versions).
- `tests/routes.db.integration.test.ts` — real route handlers invoked directly
  against the live database via the auth-override test hook.
- `tests/idor.integration.test.ts` — cross-tenant isolation through the service
  layer against the live database.

Tests run with Node 24.14 in strip-only mode, which cannot load the codebase
directly (no parameter properties, `@/` aliases, extensionless imports). The
custom loader (`tests/alias-loader.mjs`) resolves aliases and relative imports,
and transpiles project `.ts` files with `typescript.transpileModule`.

## Adding a resource

1. Prisma model + migration; regenerate the client.
2. Repository in `lib/data/repositories` implementing the `Repositories` map.
3. Service in `lib/services` expressing business rules and throwing taxonomy
   errors.
4. Route folder `app/api/<resource>/route.ts` with a zod schema, rate-limit
   options, and a thin controller calling exactly one service method.
5. Tests: pipeline-level unit tests, service unit tests, and a DB integration
   test wired through `__setAuthResolverForTests`.
