import { test } from "node:test";
import assert from "node:assert/strict";
import { OrgService } from "@/lib/services/org.service";
import { ForbiddenError, NotFoundError } from "@/lib/http/api-error";
import type { OrgRepository, OrgRoleValue, Repositories } from "@/lib/data/repositories/types";

/**
 * RBAC contract tests (Epic 3) against an in-memory org repository:
 * role ranking, admin-only mutations, invite-by-email, and the
 * no-self-demotion / no-existence-leak guards.
 */

interface FakeOrg {
  id: string;
  name: string;
  members: Map<string, OrgRoleValue>;
}

function makeRepos(usersByEmail: Record<string, string>): { repos: Repositories; orgs: FakeOrg[]; nextId: () => string } {
  const orgs: FakeOrg[] = [];
  let counter = 0;
  const repo: OrgRepository = {
    async listForUser(userId) {
      return orgs
        .filter((o) => o.members.has(userId))
        .map((o) => ({
          id: o.id,
          name: o.name,
          callerRole: o.members.get(userId)!,
          memberCount: o.members.size,
          createdAt: new Date().toISOString(),
        }));
    },
    async create(name, userId) {
      counter += 1;
      const org: FakeOrg = { id: `org_${counter}`, name, members: new Map([[userId, "admin"]]) };
      orgs.push(org);
      return { id: org.id, name, callerRole: "admin", memberCount: 1, createdAt: new Date().toISOString() };
    },
    async roleOf(orgId, userId) {
      return orgs.find((o) => o.id === orgId)?.members.get(userId) ?? null;
    },
    async findUserIdByEmail(email) {
      return usersByEmail[email.toLowerCase()] ?? null;
    },
    async addMember(orgId, userId, role) {
      const org = orgs.find((o) => o.id === orgId);
      if (!org || org.members.has(userId)) throw new Error("duplicate or missing");
      org.members.set(userId, role);
    },
    async changeRole(orgId, userId, role) {
      const org = orgs.find((o) => o.id === orgId);
      if (!org || !org.members.has(userId)) throw new NotFoundError();
      org.members.set(userId, role);
    },
    async removeMember(orgId, userId) {
      const org = orgs.find((o) => o.id === orgId);
      if (!org || !org.members.has(userId)) throw new NotFoundError();
      org.members.delete(userId);
    },
  };
  const auditLogs: Repositories["auditLogs"] = {
    async append() {
      return { id: "a1", organizationId: null, userId: "u", action: "x", targetType: null, targetId: null, metadata: null, createdAt: new Date().toISOString() };
    },
    async listForOrg() {
      return [];
    },
  };
  const comments: Repositories["comments"] = {
    async list() { return []; },
    async create(_d: string, a: string, t: string, x: number, y: number) { return { id: "c1", diagramId: "d1", authorId: a, text: t, x, y, createdAt: new Date().toISOString() }; },
    async delete() {},
  };
  const adrs: Repositories["adrs"] = {
    async list() { return []; },
    async create(_d: string, _a: string, d: { title: string; status: string; context: string; decision: string; consequences: string; linkedNodes: string[] }) { return { id: "a1", diagramId: "d1", number: 1, title: d.title, status: d.status, context: d.context, decision: d.decision, consequences: d.consequences, linkedNodes: d.linkedNodes, authorId: "u", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; },
    async update() { return { id: "a1", diagramId: "d1", number: 1, title: "t", status: "proposed", context: "", decision: "", consequences: "", linkedNodes: [], authorId: "u", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; },
    async delete() {},
  };
  return {
    repos: { ...({} as Repositories), orgs: repo, auditLogs, comments, adrs } as Repositories,
    orgs,
    nextId: () => `org_${counter + 1}`,
  };
}

test("creator becomes the first admin", async () => {
  const { repos } = makeRepos({});
  const service = new OrgService(repos);
  const org = await service.create("Acme", "user-a");
  assert.equal(org.callerRole, "admin");
});

test("listing only shows the caller's organizations", async () => {
  const { repos } = makeRepos({});
  const service = new OrgService(repos);
  await service.create("Mine", "user-a");
  await service.create("Other", "user-b");
  const mine = await service.list("user-a");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].name, "Mine");
});

test("inviting requires admin; outsiders get not_found (no leak)", async () => {
  const { repos } = makeRepos({ "dev@x.io": "user-dev" });
  const service = new OrgService(repos);
  const org = await service.create("Acme", "user-admin");
  const editor = await service.create("OtherOrg", "user-editor");

  // Editor acting on Acme — a member of ANOTHER org — must see not_found.
  await assert.rejects(
    service.inviteMember(org.id, "user-editor", "dev@x.io", "viewer"),
    NotFoundError
  );
  void editor;

  // Non-existent org for a real user — same not_found signal.
  await assert.rejects(
    service.inviteMember("missing-org", "user-admin", "dev@x.io", "viewer"),
    NotFoundError
  );

  // Unknown email inside a real org → explicit not found for that email.
  await assert.rejects(
    service.inviteMember(org.id, "user-admin", "ghost@x.io", "viewer"),
    NotFoundError
  );

  // Admin invites successfully.
  const invited = await service.inviteMember(org.id, "user-admin", "DEV@x.io", "editor");
  assert.equal(invited.userId, "user-dev");
  // Duplicate join is rejected honestly.
  await assert.rejects(
    service.inviteMember(org.id, "user-admin", "dev@x.io", "viewer"),
    ForbiddenError
  );
});

test("role changes need admin; self-demotion is blocked, other-member demotion works", async () => {
  const { repos } = makeRepos({ "dev@x.io": "user-dev", "owner@x.io": "user-admin" });
  const service = new OrgService(repos);
  const org = await service.create("Acme", "user-admin");
  await service.inviteMember(org.id, "user-admin", "dev@x.io", "viewer");

  // Non-admin cannot change roles.
  await assert.rejects(
    service.changeRole(org.id, "user-dev", "someone@x.io", "viewer"),
    ForbiddenError
  );

  // Promote them to admin…
  await service.changeRole(org.id, "user-admin", "dev@x.io", "admin");

  // …an admin still cannot lower their OWN role (self-email resolves to self)…
  await assert.rejects(
    service.changeRole(org.id, "user-dev", "dev@x.io", "viewer"),
    ForbiddenError
  );
  // …but can demote another admin.
  await service.changeRole(org.id, "user-admin", "dev@x.io", "viewer");
  assert.equal(await repos.orgs.roleOf(org.id, "user-dev"), "viewer");

  // …and cannot remove themselves either.
  await assert.rejects(service.removeMember(org.id, "user-admin", "owner@x.io"), ForbiddenError);

  // Removing another member works.
  await service.removeMember(org.id, "user-admin", "dev@x.io");
  assert.equal(await repos.orgs.roleOf(org.id, "user-dev"), null);
});
