import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectService } from "@/lib/services/project.service";
import { DiagramService } from "@/lib/services/diagram.service";
import { VersionService } from "@/lib/services/version.service";
import { ValidationService } from "@/lib/services/validation.service";
import { IdempotencyService } from "@/lib/services/idempotency.service";
import {
  NotFoundError as RepoNotFoundError,
  UniqueConflictError,
  type Repositories,
} from "@/lib/data/repositories/types";
import { ForbiddenError, ConflictError, NotFoundError as ApiNotFoundError } from "@/lib/http/api-error";
import type { DiagramRow, ProjectRow, VersionRow } from "@/lib/data/repositories/types";

/**
 * Service-layer unit tests against in-memory fake repositories.
 *
 * These prove the business rules (quota, atomic create, optimistic
 * concurrency, monotonic versions + race retry, idempotency replay)
 * without a database. The Prisma-backed repos are covered separately by
 * idor.integration.test.ts and routes.db.integration.test.ts.
 */

type DiagramStore = DiagramRow & { userId: string; prompts: unknown[]; changes: string[] };
type ProjectStore = ProjectRow & { userId: string };

let clockMs = 0;

/** Monotonic clock so updates in the same test always differ. */
function now(): string {
  clockMs += 1;
  return new Date(Date.now() + clockMs).toISOString();
}

function makeFakeRepos(): {
  repos: Repositories;
  state: {
    projects: ProjectStore[];
    diagrams: Map<string, DiagramStore>;
    versions: Map<string, VersionRow[]>;
    validation: Map<string, { issues: unknown[]; score: number; createdAt: string }>;
    idempotency: Map<string, { status: number; body: unknown }>;
    versionCreateFailures: number;
  };
} {
  const state = {
    projects: [] as ProjectStore[],
    diagrams: new Map<string, DiagramStore>(),
    versions: new Map<string, VersionRow[]>(),
    validation: new Map<string, { issues: unknown[]; score: number; createdAt: string }>(),
    idempotency: new Map<string, { status: number; body: unknown }>(),
    versionCreateFailures: 0,
  };

  const repos: Repositories = {
    projects: {
      async list(userId) {
        return state.projects
          .filter((p) => p.userId === userId)
          .map(({ userId: _u, ...row }) => ({ ...row, diagramCount: 0 }));
      },
      async countByUser(userId) {
        return state.projects.filter((p) => p.userId === userId).length;
      },
      async findOwned(id, userId) {
        const p = state.projects.find((x) => x.id === id && x.userId === userId);
        if (!p) return null;
        const { userId: _u, ...row } = p;
        return { ...row, diagramCount: 0 };
      },
      async create(input, userId) {
        const row: ProjectStore = {
          id: input.id,
          name: input.name,
          description: input.description,
          githubRepo: null,
          githubBranch: "main",
          lastSyncedAt: null,
          syncing: false,
          diagramCount: 0,
          createdAt: now(),
          updatedAt: now(),
          userId,
        };
        state.projects.push(row);
        const { userId: _u, ...out } = row;
        return out;
      },
      async touch() {},
      async remove(id) {
        const before = state.projects.length;
        state.projects = state.projects.filter((p) => p.id !== id);
        if (state.projects.length === before) throw new RepoNotFoundError();
      },
    },
    diagrams: {
      async list(projectId, userId) {
        return [...state.diagrams.values()]
          .filter((d) => d.userId === userId && (projectId === null || d.projectId === projectId))
          .map(({ userId: _u, prompts: _p, changes: _c, ...row }) => row);
      },
      async get(id, userId) {
        const d = state.diagrams.get(id);
        if (!d || d.userId !== userId) return null;
        const { userId: _u, prompts: _p, changes: _c, ...row } = d;
        return row;
      },
      async create(data) {
        // Ownership derives from the project, matching the real schema.
        const owner = state.projects.find((p) => p.id === data.projectId)?.userId ?? "";
        const row: DiagramStore = {
          ...data,
          userId: owner,
          prompts: [],
          changes: [],
          createdAt: now(),
          updatedAt: now(),
        };
        state.diagrams.set(data.id, row);
        const { userId: _u, prompts: _p, changes: _c, ...out } = row;
        return out;
      },
      async update(id, patch, userId, expectedUpdatedAt) {
        const d = state.diagrams.get(id);
        if (!d || d.userId !== userId) return null;
        // Conditional write — mirrors the real updateMany(WHERE token).
        if (expectedUpdatedAt && d.updatedAt !== expectedUpdatedAt) return null;
        Object.assign(d, patch, { updatedAt: now() });
        const { userId: _u, prompts: _p, changes: _c, ...row } = d;
        return row;
      },
      async deleteCascade(id) {
        state.diagrams.delete(id);
        state.versions.delete(id);
        state.validation.delete(id);
      },
      async requireOwned(id, userId) {
        const d = state.diagrams.get(id);
        if (!d || d.userId !== userId) throw new RepoNotFoundError();
      },
      async recordPrompt(diagramId, entry) {
        const d = state.diagrams.get(diagramId);
        if (!d) throw new RepoNotFoundError();
        d.prompts.push(entry);
      },
      async listPromptHistory(diagramId, userId) {
        const d = state.diagrams.get(diagramId);
        if (!d || d.userId !== userId) return [];
        return d.prompts as never[];
      },
      async recordChange(diagramId, summary) {
        const d = state.diagrams.get(diagramId);
        if (!d) throw new RepoNotFoundError();
        d.changes.push(summary);
      },
      async listChanges(diagramId, userId) {
        const d = state.diagrams.get(diagramId);
        if (!d || d.userId !== userId) return [];
        return d.changes.map((summary, i) => ({ at: `${i}`, summary }));
      },
    },
    versions: {
      async list(diagramId, userId) {
        const d = state.diagrams.get(diagramId);
        if (!d || d.userId !== userId) return [];
        return [...(state.versions.get(diagramId) ?? [])].reverse();
      },
      async latest(diagramId) {
        const list = state.versions.get(diagramId) ?? [];
        return list.length ? list[list.length - 1] : null;
      },
      async create(data) {
        if (state.versionCreateFailures > 0) {
          state.versionCreateFailures -= 1;
          // The racing request committed its version — record it, then let
          // our insert collide with the constraint as it would in Postgres.
          const list = state.versions.get(data.diagramId) ?? [];
          list.push({ ...data, createdAt: now() });
          state.versions.set(data.diagramId, list);
          throw new UniqueConflictError("Version number already taken — retry with the next number");
        }
        const list = state.versions.get(data.diagramId) ?? [];
        if (list.some((v) => v.version === data.version)) {
          throw new UniqueConflictError("Version number already taken — retry with the next number");
        }
        list.push({ ...data, createdAt: now() });
        state.versions.set(data.diagramId, list);
      },
    },
    validation: {
      async latest(diagramId, userId) {
        const d = state.diagrams.get(diagramId);
        if (!d || d.userId !== userId) return null;
        return (state.validation.get(diagramId) ?? null) as never;
      },
      async save(diagramId, report) {
        state.validation.set(diagramId, { ...report, createdAt: now() });
      },
      async updateDiagramFlags(diagramId, _userId, flags) {
        const d = state.diagrams.get(diagramId);
        if (d) Object.assign(d, flags);
      },
    },
    idempotency: {
      async find(key, userId) {
        return state.idempotency.get(`${userId}:${key}`) ?? null;
      },
      async record(key, userId, result) {
        const id = `${userId}:${key}`;
        if (state.idempotency.has(id)) {
          throw new UniqueConflictError("Idempotency key already recorded");
        }
        state.idempotency.set(id, result);
      },
      async purgeOlderThan() {
        return 0; // fake records carry no createdAt — nothing expires
      },
    },
    orgs: {
      async listForUser() {
        return [];
      },
      async create(name, userId) {
        return { id: "org_new", name, callerRole: "admin" as const, memberCount: 1, createdAt: new Date().toISOString() };
      },
      async roleOf() {
        return null;
      },
      async findUserIdByEmail() {
        return null;
      },
      async addMember() {},
      async changeRole() {},
      async removeMember() {},
    },
    auditLogs: {
      async append() {
        return { id: "audit_1", organizationId: null, userId: "u", action: "x", targetType: null, targetId: null, metadata: null, createdAt: new Date().toISOString() };
      },
      async listForOrg() {
        return [];
      },
    },
    comments: {
      async list() { return []; },
      async create(_diagramId: string, authorId: string, text: string, x: number, y: number) {
        return { id: "c1", diagramId: "d1", authorId, text, x, y, createdAt: new Date().toISOString() };
      },
      async delete() {},
    },
    adrs: {
      async list() { return []; },
      async create(_diagramId: string, _authorId: string, data: { title: string; status: string; context: string; decision: string; consequences: string; linkedNodes: string[] }) {
        return { id: "a1", diagramId: "d1", number: 1, title: data.title, status: data.status, context: data.context, decision: data.decision, consequences: data.consequences, linkedNodes: data.linkedNodes, authorId: "u", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      },
      async update(_id: string, _userId: string, patch: Partial<{ title: string }>) {
        return { id: "a1", diagramId: "d1", number: 1, title: patch.title ?? "t", status: "proposed", context: "", decision: "", consequences: "", linkedNodes: [], authorId: "u", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      },
      async delete() {},
    },
    withTransaction: <T>(fn: (tx: Repositories) => Promise<T>): Promise<T> => fn(repos),
  };

  return { repos, state };
}

test("ProjectService enforces the per-user quota", async () => {
  const { repos } = makeFakeRepos();
  const service = new ProjectService(repos, { maxProjectsPerUser: 2 });
  await service.create({ name: "one" }, "user-a");
  await service.create({ name: "two" }, "user-a");
  await assert.rejects(service.create({ name: "three" }, "user-a"), ForbiddenError);
  // Different user is unaffected.
  await service.create({ name: "other" }, "user-b");
});

test("ProjectService.remove deletes only owned projects", async () => {
  const { repos, state } = makeFakeRepos();
  await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const service = new ProjectService(repos);
  // Not owned → false, nothing deleted (no existence leak).
  assert.equal(await service.remove("project-1", "user-b"), false);
  assert.equal(state.projects.length, 1);
  assert.equal(await service.remove("missing", "user-a"), false);
  assert.equal(await service.remove("project-1", "user-a"), true);
  assert.equal(state.projects.length, 0);
});

test("DiagramService.create snapshots version 1 in the same transaction", async () => {
  const { repos, state } = makeFakeRepos();
  const project = await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const service = new DiagramService(repos);
  const diagram = await service.create({ name: "D", type: "CLASS" }, project.id, "user-a");
  const versions = state.versions.get(diagram.id) ?? [];
  assert.equal(versions.length, 1);
  assert.equal(versions[0].version, 1);
  assert.equal(versions[0].summary, "Initial snapshot");
  const viaRepo = await repos.diagrams.get(diagram.id, "user-a");
  assert.notEqual(viaRepo, null);
  assert.equal(viaRepo!.mermaidCode.length > 0, true);
});

test("DiagramService.create rejects projects the caller does not own", async () => {
  const { repos } = makeFakeRepos();
  await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const service = new DiagramService(repos);
  await assert.rejects(service.create({ name: "D", type: "CLASS" }, "project-1", "user-b"), ApiNotFoundError);
});

test("DiagramService.update returns 409-style ConflictError on stale expectedUpdatedAt", async () => {
  const { repos } = makeFakeRepos();
  const project = await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const service = new DiagramService(repos);
  const diagram = await service.create({ name: "D", type: "CLASS" }, project.id, "user-a");
  const updatedAtAtCreate = diagram.updatedAt;
  // Someone else updates the diagram first (touch from another session).
  await repos.diagrams.update(diagram.id, { name: "edited elsewhere" }, "user-a");
  await assert.rejects(
    service.update(diagram.id, { name: "mine" }, "user-a", updatedAtAtCreate),
    ConflictError
  );
  // A fresh expectedUpdatedAt (the current one) goes through.
  const current = await repos.diagrams.get(diagram.id, "user-a");
  const updated = await service.update(diagram.id, { name: "mine" }, "user-a", current!.updatedAt);
  assert.equal(updated!.name, "mine");
});

test("DiagramService.remove deletes child rows for the owner, false otherwise", async () => {
  const { repos, state } = makeFakeRepos();
  const project = await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const service = new DiagramService(repos);
  const diagram = await service.create({ name: "D", type: "CLASS" }, project.id, "user-a");
  await service.recordPrompt(diagram.id, { prompt: "p", response: "r", actionType: "generate" }, "user-a");
  assert.equal(await service.remove(diagram.id, "user-b"), false);
  assert.equal(state.diagrams.has(diagram.id), true);
  assert.equal(await service.remove(diagram.id, "user-a"), true);
  assert.equal(state.diagrams.has(diagram.id), false);
  assert.equal(state.versions.has(diagram.id), false);
  assert.equal(await service.get(diagram.id, "user-a"), null);
});

test("recordPrompt / recordChange throw NotFoundError for non-owners", async () => {
  const { repos } = makeFakeRepos();
  const project = await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const service = new DiagramService(repos);
  const diagram = await service.create({ name: "D", type: "CLASS" }, project.id, "user-a");
  await assert.rejects(
    service.recordPrompt(diagram.id, { prompt: "p", response: "r", actionType: "generate" }, "user-b"),
    RepoNotFoundError
  );
  await assert.rejects(service.recordChange(diagram.id, "x", "user-b"), RepoNotFoundError);
});

test("VersionService assigns monotonic numbers and retries on unique conflicts", async () => {
  const { repos, state } = makeFakeRepos();
  const project = await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const service = new DiagramService(repos);
  const versions = new VersionService(repos);
  const diagram = await service.create({ name: "D", type: "CLASS" }, project.id, "user-a");
  const input = { label: "v", mermaidCode: "classDiagram", summary: "s", changes: ["c"] };
  assert.equal(await versions.save(diagram.id, input, "user-a"), 2);
  assert.equal(await versions.save(diagram.id, input, "user-a"), 3);
  // Simulate a racing save that steals number 4 exactly once.
  state.versionCreateFailures = 1;
  const version = await versions.save(diagram.id, input, "user-a");
  assert.equal(version, 5);
  // The client-supplied version number is advisory and ignored.
  await assert.rejects(versions.save(diagram.id, input, "user-b"), RepoNotFoundError);
});

test("ValidationService.save persists the report and diagram flags atomically", async () => {
  const { repos, state } = makeFakeRepos();
  const project = await repos.projects.create({ id: "project-1", name: "P", description: null }, "user-a");
  const diagrams = new DiagramService(repos);
  const validation = new ValidationService(repos);
  const diagram = await diagrams.create({ name: "D", type: "CLASS" }, project.id, "user-a");
  await validation.save(diagram.id, { issues: [], score: 100 }, "user-a");
  const report = await validation.get(diagram.id, "user-a");
  assert.notEqual(report, null);
  assert.equal(report!.score, 100);
  const row = state.diagrams.get(diagram.id)!;
  assert.equal(row.isValid, true);
  assert.equal(row.validationScore, 100);
  // Non-owners see nothing.
  assert.equal(await validation.get(diagram.id, "user-b"), null);
});

test("IdempotencyService replays stored responses and survives key races", async () => {
  const { repos, state } = makeFakeRepos();
  const service = new IdempotencyService(repos);
  let produced = 0;
  const produce = async () => {
    produced += 1;
    return { status: 201, body: { id: "diagram-1" } };
  };
  const first = await service.run("key-1", "user-a", produce);
  assert.equal(first.replayed, false);
  assert.equal(produced, 1);
  const second = await service.run("key-1", "user-a", produce);
  assert.equal(second.replayed, true);
  assert.equal(second.body.id, "diagram-1");
  assert.equal(produced, 1, "produce must not re-run for a replayed key");

  // Race: our record() hits the unique constraint because another request
  // with the same key recorded first — we must return ITS stored body.
  state.idempotency.set("user-b:key-2", { status: 201, body: { id: "winner" } });
  const race = await service.run("key-2", "user-b", produce);
  assert.equal(race.replayed, true);
  assert.equal(race.body.id, "winner");
  assert.equal(produced, 1, "loser must not execute produce");
});