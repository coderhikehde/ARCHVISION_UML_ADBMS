/**
 * Typed error taxonomy for the HTTP layer.
 *
 * Every route handler and service throws ApiError subclasses; the
 * withApiHandler wrapper is the only place that maps them to HTTP status
 * codes + the wire error shape:
 *
 *   { ok: false, error: { code, message, requestId, details? } }
 *
 * Status code is the single source of truth for clients; `code` is a
 * stable machine-readable string (diffable in the OpenAPI contract);
 * `message` is developer/UI friendly.
 *
 * Deliberate: NotFound is returned for BOTH "row does not exist" and
 * "row belongs to someone else". Same status for both means row existence
 * can never be inferred from the response code (see repository layer).
 */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unprocessable_entity"
  | "service_unavailable"
  | "ai_unavailable"
  | "internal";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "Invalid request", details?: unknown) {
    super(400, "bad_request", message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(403, "forbidden", message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found or not yours") {
    super(404, "not_found", message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, "conflict", message, details);
  }
}

/** Thrown by the rate limiter; the wrapper adds the Retry-After header. */
export class RateLimitedError extends ApiError {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super(429, "rate_limited", "Rate limit exceeded");
    this.retryAfter = retryAfter;
  }
}

export class UnprocessableEntityError extends ApiError {
  constructor(message = "Unprocessable entity", details?: unknown) {
    super(422, "unprocessable_entity", message, details);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = "Service unavailable") {
    super(503, "service_unavailable", message);
  }
}

/** AI provider failure or missing key — 502 so clients degrade to offline engines. */
export class AiUnavailableError extends ApiError {
  constructor(message = "AI provider unavailable") {
    super(502, "ai_unavailable", message);
  }
}

export class InternalError extends ApiError {
  constructor(message = "Internal server error") {
    super(500, "internal", message);
  }
}