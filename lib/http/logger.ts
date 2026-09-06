import { createHash } from "crypto";

/**
 * Structured JSON logger scoped to a single request.
 *
 * One log line per log call, serialized as JSON with a stable field set
 * (level, ts, requestId, ...fields, msg) so log aggregators can index it
 * without custom parsing. `userId` is stored HASHED — the full identifier
 * is never written to logs.
 */

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

export function createLogger(requestId: string): Logger {
  const emit = (level: "info" | "warn" | "error", msg: string, fields?: LogFields): void => {
    const line = JSON.stringify({
      level,
      ts: new Date().toISOString(),
      requestId,
      ...fields,
      msg,
    });
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  };
  return {
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}