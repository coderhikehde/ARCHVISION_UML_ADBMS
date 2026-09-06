import { withApiHandler } from "@/lib/http/with-api-handler";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_CHECK_TIMEOUT_MS = 3000;

/**
 * GET /api/health — uptime-check endpoint.
 *
 * Reports DB reachability (bounded 3s query) and AI-provider presence.
 * Intentionally unauthenticated (auth: optional) so load balancers and
 * uptime checks can probe it without a session.
 */
export const GET = withApiHandler(
  async (ctx) => {
    let dbStatus: "up" | "down" = "up";
    let dbDetail: string | null = null;
    try {
      await Promise.race([
        db.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("database check timed out")), DB_CHECK_TIMEOUT_MS)
        ),
      ]);
    } catch (error) {
      dbStatus = "down";
      // Diagnostic only, never leak connection details (URLs/hosts).
      dbDetail = error instanceof Error && error.message.includes("timed out")
        ? "database check timed out"
        : "database check failed";
      ctx.log.warn("health check: database unreachable", {
        detail: error instanceof Error ? error.message : "unknown",
      });
    }

    const aiProvider = process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : "none";

    return ctx.json(
      {
        status: dbStatus === "up" ? "ok" : "degraded",
        service: "archvision-api",
        db: dbStatus,
        dbDetail,
        aiProvider,
        dataMode: process.env.NEXT_PUBLIC_DATA_MODE ?? "local",
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      { status: dbStatus === "up" ? 200 : 503 }
    );
  },
  {
    auth: "optional",
    rateLimit: { key: "health", limit: 60, windowMs: 60_000 },
    name: "health",
  }
);