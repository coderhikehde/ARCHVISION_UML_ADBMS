import { ServiceUnavailableError } from "./api-error";

/**
 * DB-mode gate for the storage family of routes.
 *
 * Preserves the original /api/storage contract: when
 * NEXT_PUBLIC_DATA_MODE is not "db" the API answers 503 so the client
 * facade's health check fails cleanly and the session falls back to
 * localStorage. The app must keep running fully client-side without a DB.
 */
export function assertDataModeEnabled(): void {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "db") {
    throw new ServiceUnavailableError(
      "Storage API is disabled — set NEXT_PUBLIC_DATA_MODE=db and a live DATABASE_URL to enable PostgreSQL persistence."
    );
  }
}