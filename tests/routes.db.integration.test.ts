import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * Route integration tests — the real route handlers, the real services,
 * and the real database, with only the session resolver stubbed out.
 *
 * Skips cleanly when DATABASE_URL is unset or unreachable. Verifies the
 * full HTTP contract end-to-end: envelopes, status codes, idempotency
 * replay, optimistic concurrency 409, and 400/401 handling.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
let dbOk = false;
let userId = "";
let projectId = "";
let diagramId = "";
let diagramUpdatedAt = "";
let GET: typeof import("@/app/api/diagrams/[diagramId]/route").GET;
let PATCH: typeof import("@/app/api/diagrams/[diagramId]/route").PATCH;
let DELETE: typeof import("@/app/api/diagrams/[diagramId]/route").DELETE;
let POST: typeof import("@/app/api/projects/route").POST;
let DELETE_PROJECT: typeof import("@/app/api/projects/[projectId]/route").DELETE;
let POST_DIAGRAMS: typeof import("@/app/api/projects/[projectId]/diagrams/route").POST;
let GET_DIAGRAMS_ALL: typeof import("@/app/api/diagrams/route").GET;
let HEALTH: typeof import("@/app/api/health/route").GET;
let setAuth: (r: (() => Promise<{ user?: { id?: string } | null } | null>) | null) => void;

before(async () => {
  if (!HAS_DB) return;
  try {
    const dbMod = await import("@/lib/db");
    await dbMod.db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
    return;
  }
  const handler = await import("@/lib/http/with-api-handler");
  setAuth = handler.__setAuthResolverForTests;
  const projects = await import("@/app/api/projects/route");
  const projectItem = await import("@/app/api/projects/[projectId]/route");
  const diagramsByProject = await import("@/app/api/projects/[projectId]/diagrams/route");
  const diagramsAll = await import("@/app/api/diagrams/route");
  const diagram = await import("@/app/api/diagrams/[diagramId]/route");
  const health = await import("@/app/api/health/route");
  GET = diagram.GET;
  PATCH = diagram.PATCH;
  DELETE = diagram.DELETE;
  POST = projects.POST;
  DELETE_PROJECT = projectItem.DELETE;
  POST_DIAGRAMS = diagramsByProject.POST;
  GET_DIAGRAMS_ALL = diagramsAll.GET;
  HEALTH = health.GET;

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  userId = `test_${stamp}_routes`;
  const dbMod = await import("@/lib/db");
  await dbMod.db.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, name: "Route Test", email: `${userId}@test.local` },
  });
  setAuth(() => Promise.resolve({ user: { id: userId } }));
});

after(async () => {
  if (!dbOk) return;
  setAuth(null);
  try {
    const dbMod = await import("@/lib/db");
    await dbMod.db.project.deleteMany({ where: { userId } });
    await dbMod.db.user.deleteMany({ where: { id: userId } });
  } catch {
    // Cleanup is best-effort.
  }
});

function api(path: string, init: RequestInit = {}): Promise<Response> {
  // The route handlers are plain functions of (Request, routeContext?) —
  // no live server needed; they read headers/body/path from the Request.
  const method = (init.method ?? "GET") as "GET" | "POST" | "PATCH" | "DELETE";
  if (path === "/api/health" && method === "GET") return HEALTH(new Request(`http://localhost${path}`, init));
  if (path.startsWith("/api/projects/") && method === "POST") {
    const projectId = path.match(/^\/api\/projects\/([^/]+)\/diagrams$/)?.[1] ?? "";
    return POST_DIAGRAMS(new Request(`http://localhost${path}`, init), { params: { projectId } });
  }
  if (path.startsWith("/api/projects/") && method === "DELETE") {
    const projectId = path.match(/^\/api\/projects\/([^/]+)$/)?.[1] ?? "";
    return DELETE_PROJECT(new Request(`http://localhost${path}`, init), { params: { projectId } });
  }
  if (path === "/api/diagrams" && method === "GET") {
    return GET_DIAGRAMS_ALL(new Request(`http://localhost${path}`, init));
  }
  if (path.startsWith("/api/diagrams/") && method !== "GET") {
    const diagramId = path.match(/^\/api\/diagrams\/([^/]+)$/)?.[1] ?? "";
    const handler = method === "PATCH" ? PATCH : method === "DELETE" ? DELETE : PATCH;
    return handler(new Request(`http://localhost${path}`, init), { params: { diagramId } });
  }
  if (path.startsWith("/api/diagrams/")) {
    const diagramId = path.match(/^\/api\/diagrams\/([^/]+)$/)?.[1] ?? "";
    return GET(new Request(`http://localhost${path}`, init), { params: { diagramId } });
  }
  if (path === "/api/projects" && method === "POST") {
    return POST(new Request(`http://localhost${path}`, init));
  }
  throw new Error(`Test helper: unhandled route ${method} ${path}`);
}

test("POST /api/projects creates and returns the { ok, data } envelope", { skip: !HAS_DB }, async (t) => {
  if (!dbOk) return t.skip("DATABASE_URL not reachable");
  const res = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Route test project" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { ok: boolean; data: { id: string; name: string } };
  assert.equal(body.ok, true);
  assert.equal(body.data.name, "Route test project");
  projectId = body.data.id;
});

test("POST create diagram is idempotent under a repeated Idempotency-Key", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !projectId) return t.skip("DATABASE_URL not reachable");
  const path = `/api/projects/${projectId}/diagrams`;
  const make = () =>
    api(path, {
      method: "POST",
      headers: { "Idempotency-Key": "route-test-key-1" },
      body: JSON.stringify({ name: "Idempotent diagram", type: "CLASS" }),
    });
  const first = await make();
  assert.equal(first.status, 201);
  const firstBody = (await first.json()) as { ok: boolean; data: { id: string } };
  diagramId = firstBody.data.id;
  const second = await make();
  assert.equal(second.status, 201);
  const secondBody = (await second.json()) as { ok: boolean; data: { id: string } };
  assert.equal(secondBody.data.id, diagramId, "replayed request must return the SAME diagram");

  const dbMod = await import("@/lib/db");
  const count = await dbMod.db.diagram.count({ where: { id: diagramId } });
  assert.equal(count, 1, "the create must have executed exactly once");
  diagramUpdatedAt = firstBody.data.id ? "" : "";
});

test("GET /api/diagrams/:missing returns 200 with data null (no 404 leak)", { skip: !HAS_DB }, async (t) => {
  if (!dbOk) return t.skip("DATABASE_URL not reachable");
  const res = await api("/api/diagrams/does-not-exist");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; data: unknown };
  assert.equal(body.ok, true);
  assert.equal(body.data, null);
});

test("PATCH with a stale expectedUpdatedAt returns 409 conflict", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !diagramId) return t.skip("DATABASE_URL not reachable");
  const getRes = await api(`/api/diagrams/${diagramId}`);
  const getBody = (await getRes.json()) as { ok: boolean; data: { updatedAt: string } };
  const realUpdatedAt = getBody.data.updatedAt;
  // Advance the row so any expectedUpdatedAt we send is stale.
  const dbMod = await import("@/lib/db");
  await dbMod.db.diagram.update({
    where: { id: diagramId },
    data: { name: "touched by another session" },
  });
  const res = await api(`/api/diagrams/${diagramId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "mine", expectedUpdatedAt: realUpdatedAt }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { ok: boolean; error: { code: string } };
  assert.equal(body.error.code, "conflict");
  diagramUpdatedAt = realUpdatedAt;
});

test("POST /api/projects with an oversized name returns 400", { skip: !HAS_DB }, async (t) => {
  if (!dbOk) return t.skip("DATABASE_URL not reachable");
  const res = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "x".repeat(200) }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: { code: string; details: unknown[] } };
  assert.equal(body.error.code, "bad_request");
  assert.ok(Array.isArray(body.error.details));
});

test("unauthenticated POST /api/projects returns 401", { skip: !HAS_DB }, async (t) => {
  if (!dbOk) return t.skip("DATABASE_URL not reachable");
  setAuth(() => Promise.resolve(null));
  try {
    const res = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "nope" }),
    });
    assert.equal(res.status, 401);
  } finally {
    setAuth(() => Promise.resolve({ user: { id: userId } }));
  }
});

test("DELETE /api/projects/:id removes the project and its diagrams, then reports false", { skip: !HAS_DB }, async (t) => {
  if (!dbOk) return t.skip("DATABASE_URL not reachable");
  // A dedicated project so the earlier fixtures stay untouched.
  const createRes = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Doomed project" }),
  });
  const created = (await createRes.json()) as { ok: boolean; data: { id: string } };
  const doomedId = created.data.id;
  await api(`/api/projects/${doomedId}/diagrams`, {
    method: "POST",
    body: JSON.stringify({ name: "Doomed diagram", type: "CLASS" }),
  });

  // Not-owned / missing ids return 200 data:false — no existence leak.
  const missing = await api("/api/projects/does-not-exist", { method: "DELETE" });
  assert.equal(missing.status, 200);
  assert.equal(((await missing.json()) as { data: boolean }).data, false);

  const res = await api(`/api/projects/${doomedId}`, { method: "DELETE" });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { data: boolean }).data, true);

  // The diagram list no longer contains anything from the deleted project.
  const diagramsRes = await api("/api/diagrams");
  const diagramsBody = (await diagramsRes.json()) as {
    ok: boolean;
    data: Array<{ projectId: string }>;
  };
  assert.equal(
    diagramsBody.data.some((d) => d.projectId === doomedId),
    false,
    "cascade must remove the project's diagrams"
  );

  // Deleting again is an honest false, not an error.
  const again = await api(`/api/projects/${doomedId}`, { method: "DELETE" });
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as { data: boolean }).data, false);
});

test("GET /api/health reports the service as ok when the database responds", { skip: !HAS_DB }, async (t) => {
  if (!dbOk) return t.skip("DATABASE_URL not reachable");
  const res = await api("/api/health");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; data: { status: string; db: string } };
  assert.equal(body.ok, true);
  assert.equal(body.data.status, "ok");
  assert.equal(body.data.db, "up");
});