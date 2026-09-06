import type { DiagramType, ViewMode } from "@/types/diagram";

/**
 * Persistence-only interfaces for the service layer.
 *
 * These are the ports services depend on — implementations live in
 * lib/data/repositories/*.repository.ts and fakes live in tests. No
 * Prisma types appear here: services must never import the ORM.
 */

export class NotFoundError extends Error {
  constructor(message = "Not found or not yours") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Unique-constraint violation (e.g. duplicate (diagramId, version)) — translated by the repo layer. */
export class UniqueConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniqueConflictError";
  }
}

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  githubRepo: string | null;
  githubBranch: string;
  lastSyncedAt: string | null;
  syncing: boolean;
  diagramCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramRow {
  id: string;
  name: string;
  type: DiagramType;
  projectId: string;
  mermaidCode: string;
  viewMode: ViewMode;
  isValid: boolean;
  validationScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramPatch {
  name?: string;
  mermaidCode?: string;
  viewMode?: ViewMode;
  isValid?: boolean;
  validationScore?: number | null;
}

export interface DiagramCreateData {
  id: string;
  name: string;
  type: DiagramType;
  projectId: string;
  mermaidCode: string;
  viewMode: ViewMode;
  isValid: boolean;
  validationScore: number | null;
}

export interface VersionRow {
  version: number;
  label: string;
  mermaidCode: string;
  summary: string;
  changes: string[];
  createdAt: string;
}

export interface VersionCreateData {
  diagramId: string;
  version: number;
  label: string;
  mermaidCode: string;
  summary: string;
  changes: string[];
}

export interface PromptHistoryRow {
  id: string;
  diagramId: string;
  prompt: string;
  response: string;
  actionType: "generate" | "transform" | "analyze" | "explain";
  createdAt: string;
}

export interface ChangeRow {
  at: string;
  summary: string;
}

export interface ValidationReportRow {
  issues: Array<{ severity: string; message: string; rule: string; target: string | null }>;
  score: number;
  createdAt: string;
}

export interface ProjectRepository {
  list(userId: string, limit?: number, offset?: number): Promise<ProjectRow[]>;
  countByUser(userId: string): Promise<number>;
  findOwned(id: string, userId: string): Promise<ProjectRow | null>;
  create(input: { id: string; name: string; description: string | null }, userId: string): Promise<ProjectRow>;
  touch(id: string): Promise<void>;
  /** Deletes the project row; Diagram FK cascade removes its diagrams and children. */
  remove(id: string): Promise<void>;
}

export interface DiagramRepository {
  list(projectId: string | null, userId: string, limit?: number, offset?: number): Promise<DiagramRow[]>;
  get(id: string, userId: string): Promise<DiagramRow | null>;
  create(data: DiagramCreateData): Promise<DiagramRow>;
  /**
   * Partial update. When `expectedUpdatedAt` is provided the write is
   * conditional on the stored row still carrying that exact value — a
   * concurrent modification makes it a no-op (count 0 → null), which the
   * service maps to 409. This keeps check-and-write race-free.
   */
  update(id: string, patch: DiagramPatch, userId: string, expectedUpdatedAt?: string): Promise<DiagramRow | null>;
  deleteCascade(id: string): Promise<void>;
  requireOwned(id: string, userId: string): Promise<void>;
  recordPrompt(diagramId: string, entry: { prompt: string; response: string; actionType: "generate" | "transform" | "analyze" | "explain" }): Promise<void>;
  listPromptHistory(diagramId: string, userId: string, limit?: number, offset?: number): Promise<PromptHistoryRow[]>;
  recordChange(diagramId: string, summary: string): Promise<void>;
  listChanges(diagramId: string, userId: string, limit?: number, offset?: number): Promise<ChangeRow[]>;
}

export interface VersionRepository {
  list(diagramId: string, userId: string, limit?: number, offset?: number): Promise<VersionRow[]>;
  latest(diagramId: string): Promise<VersionRow | null>;
  create(data: VersionCreateData): Promise<void>;
}

export interface ValidationRepository {
  latest(diagramId: string, userId: string): Promise<ValidationReportRow | null>;
  save(diagramId: string, report: { issues: unknown[]; score: number }): Promise<void>;
  updateDiagramFlags(diagramId: string, userId: string, flags: { isValid: boolean; validationScore: number | null }): Promise<void>;
}

export interface IdempotencyRepository {
  find(key: string, userId: string): Promise<{ status: number; body: unknown } | null>;
  record(key: string, userId: string, result: { status: number; body: unknown }): Promise<void>;
  /** Opportunistic expiry: deletes records created before `cutoff`. */
  purgeOlderThan(cutoff: Date): Promise<number>;
}

export type OrgRoleValue = "admin" | "editor" | "viewer" | "guest";

export interface OrgRow {
  id: string;
  name: string;
  /** The caller's role in this organization. */
  callerRole: OrgRoleValue;
  memberCount: number;
  createdAt: string;
}

export interface OrgRepository {
  /** Organizations the user belongs to, with their role. */
  listForUser(userId: string): Promise<OrgRow[]>;
  create(name: string, userId: string): Promise<OrgRow>;
  /** Caller's role, or null when not a member (also for missing orgs — no existence leak). */
  roleOf(orgId: string, userId: string): Promise<OrgRoleValue | null>;
  /** Resolves a user by email for invitations; null when no such user. */
  findUserIdByEmail(email: string): Promise<string | null>;
  addMember(orgId: string, userId: string, role: OrgRoleValue): Promise<void>;
  changeRole(orgId: string, userId: string, role: OrgRoleValue): Promise<void>;
  removeMember(orgId: string, userId: string): Promise<void>;
}

export interface AuditLogRow {
  id: string;
  organizationId: string | null;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown | null;
  createdAt: string;
}

export interface AuditLogRepository {
  append(params: {
    organizationId?: string | null;
    userId: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: unknown | null;
  }): Promise<AuditLogRow>;
  listForOrg(organizationId: string, limit?: number, offset?: number): Promise<AuditLogRow[]>;
}

export interface CommentRow {
  id: string;
  diagramId: string;
  authorId: string;
  text: string;
  x: number;
  y: number;
  createdAt: string;
}

export interface AdrRow {
  id: string;
  diagramId: string;
  number: number;
  title: string;
  status: string;
  context: string;
  decision: string;
  consequences: string;
  linkedNodes: string[];
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentRepository {
  list(diagramId: string, userId: string): Promise<CommentRow[]>;
  create(diagramId: string, authorId: string, text: string, x: number, y: number): Promise<CommentRow>;
  delete(id: string, userId: string): Promise<void>;
}

export interface AdrRepository {
  list(diagramId: string, userId: string): Promise<AdrRow[]>;
  create(diagramId: string, authorId: string, data: Omit<AdrRow, "id" | "diagramId" | "authorId" | "createdAt" | "updatedAt" | "number">): Promise<AdrRow>;
  update(id: string, userId: string, patch: Partial<Omit<AdrRow, "id" | "diagramId" | "authorId" | "createdAt" | "updatedAt">>): Promise<AdrRow | null>;
  delete(id: string, userId: string): Promise<void>;
}

/** Aggregate of every persistence port, plus transaction scoping. */
export interface Repositories {
  projects: ProjectRepository;
  diagrams: DiagramRepository;
  versions: VersionRepository;
  validation: ValidationRepository;
  idempotency: IdempotencyRepository;
  orgs: OrgRepository;
  auditLogs: AuditLogRepository;
  comments: CommentRepository;
  adrs: AdrRepository;
  /**
   * Run `fn` with transaction-scoped repositories. Fakes implement this
   * as a pass-through; the Prisma factory binds a $transaction client.
   */
  withTransaction<T>(fn: (tx: Repositories) => Promise<T>): Promise<T>;
}