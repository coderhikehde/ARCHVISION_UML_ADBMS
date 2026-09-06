import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * IDOR integration tests against a real database.
 *
 * Skips cleanly when DATABASE_URL is unset or unreachable (e.g. local dev
 * without a live Postgres). CI runs a Postgres service container and
 * applies migrations before the suite, so these tests run on every PR.
 *
 * User A creates a project + diagram; user B must not be able to read,
 * list, update, delete, or write child rows for them — and must get the
 * same "not found" signal as if the row never existed (no existence leak).
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
let dbOk = false;
let services: Awaited<ReturnType<typeof makeServices>> | null = null;

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const userA = `test_${stamp}_userA`;
const userB = `test_${stamp}_userB`;
let projectA = "";
let diagramA = "";

async function makeServices() {
  const { db } = await import("@/lib/db");
  const { createRepositories } = await import("@/lib/data/repositories");
  const { ProjectService } = await import("@/lib/services/project.service");
  const { DiagramService } = await import("@/lib/services/diagram.service");
  const { ValidationService } = await import("@/lib/services/validation.service");
  const { VersionService } = await import("@/lib/services/version.service");
  const repos = createRepositories(db);
  return {
    projects: new ProjectService(repos),
    diagrams: new DiagramService(repos),
    validation: new ValidationService(repos),
    versions: new VersionService(repos),
  };
}

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

  const { ensureSeeded } = await import("@/lib/data/seed");
  await ensureSeeded();
  services = await makeServices();

  // Create both users with unique ids to avoid collision with real data.
  const dbMod = await import("@/lib/db");
  for (const [id, name] of [
    [userA, "Test User A"],
    [userB, "Test User B"],
  ] as const) {
    await dbMod.db.user.upsert({
      where: { id },
      update: {},
      create: { id, name, email: `${id}@test.local` },
    });
  }

  const project = await services.projects.create({ name: "A's project", description: "secret" }, userA);
  projectA = project.id;
  const diagram = await services.diagrams.create(
    { name: "A's diagram", type: "CLASS", description: "confidential" },
    projectA,
    userA
  );
  diagramA = diagram.id;
});

after(async () => {
  if (!dbOk) return;
  try {
    const dbMod = await import("@/lib/db");
    await dbMod.db.project.deleteMany({ where: { userId: userA } });
    await dbMod.db.project.deleteMany({ where: { userId: userB } });
    await dbMod.db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  } catch {
    // Cleanup is best-effort.
  }
});

test("user B cannot read user A's diagram", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !services || !diagramA) return t.skip("DATABASE_URL not reachable");
  const row = await services.diagrams.get(diagramA, userB);
  assert.equal(row, null);
});

test("user B cannot list user A's projects or diagrams", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !services || !projectA || !diagramA) return t.skip("DATABASE_URL not reachable");
  const projects = await services.projects.list(userB);
  assert.ok(!projects.some((p) => p.id === projectA), "B must not see A's project");
  const diagrams = await services.diagrams.list(userB, null);
  assert.ok(!diagrams.some((d) => d.id === diagramA), "B must not see A's diagram");
});

test("user B cannot update user A's diagram", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !services || !diagramA) return t.skip("DATABASE_URL not reachable");
  const updated = await services.diagrams.update(diagramA, { name: "stolen" }, userB);
  assert.equal(updated, null);
  const still = await services.diagrams.get(diagramA, userA);
  assert.notEqual(still, null);
  assert.equal(still!.name, "A's diagram");
});

test("user B cannot delete user A's diagram", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !services || !diagramA) return t.skip("DATABASE_URL not reachable");
  const deleted = await services.diagrams.remove(diagramA, userB);
  assert.equal(deleted, false);
  const still = await services.diagrams.get(diagramA, userA);
  assert.notEqual(still, null);
});

test("user B cannot read or write child rows under user A's diagram", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !services || !diagramA) return t.skip("DATABASE_URL not reachable");
  const { NotFoundError } = await import("@/lib/data/repositories/types");

  await assert.rejects(
    services.diagrams.recordPrompt(diagramA, { prompt: "p", response: "r", actionType: "generate" }, userB),
    NotFoundError
  );
  assert.deepEqual(await services.diagrams.listPromptHistory(diagramA, userB), []);
  assert.equal(await services.validation.get(diagramA, userB), null);
  assert.deepEqual(await services.versions.list(diagramA, userB), []);
  assert.deepEqual(await services.diagrams.listChanges(diagramA, userB), []);
  await assert.rejects(services.diagrams.recordChange(diagramA, "change", userB), NotFoundError);
});

test("user A can still manage their own diagram", { skip: !HAS_DB }, async (t) => {
  if (!dbOk || !services || !projectA || !diagramA) return t.skip("DATABASE_URL not reachable");
  const updated = await services.diagrams.update(diagramA, { name: "A's renamed diagram" }, userA);
  assert.notEqual(updated, null);
  assert.equal(updated!.name, "A's renamed diagram");
  assert.ok((await services.projects.list(userA)).some((p) => p.id === projectA));
  assert.ok((await services.diagrams.list(userA, projectA)).some((d) => d.id === diagramA));
});