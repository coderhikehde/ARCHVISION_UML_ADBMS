import type { ProjectRow, Repositories } from "@/lib/data/repositories/types";
import { generateId } from "@/lib/utils";
import { ForbiddenError } from "@/lib/http/api-error";

/**
 * ProjectService — bounded context: project lifecycle.
 *
 * Business rules owned here:
 *   - max projects per user (quota) — configurable, default 50
 *   - name/description bounds (also enforced by the route schema)
 *
 * Persistence is injected via the Repositories port; no Prisma imports.
 */

export interface ProjectServiceOptions {
  maxProjectsPerUser?: number;
}

export const DEFAULT_MAX_PROJECTS_PER_USER = 50;

export class ProjectService {
  private readonly repos: Repositories;
  private readonly options: ProjectServiceOptions;

  constructor(repos: Repositories, options: ProjectServiceOptions = {}) {
    this.repos = repos;
    this.options = options;
  }

  private get maxProjects(): number {
    return this.options.maxProjectsPerUser ?? DEFAULT_MAX_PROJECTS_PER_USER;
  }

  async list(userId: string, pagination?: { limit?: number; offset?: number }): Promise<ProjectRow[]> {
    return this.repos.projects.list(userId, pagination?.limit, pagination?.offset);
  }

  /** Total project count for the caller — powers the X-Total-Count header. */
  async total(userId: string): Promise<number> {
    return this.repos.projects.countByUser(userId);
  }

  async create(input: { name: string; description?: string }, userId: string): Promise<ProjectRow> {
    const existing = await this.repos.projects.countByUser(userId);
    if (existing >= this.maxProjects) {
      throw new ForbiddenError(`Project limit reached (${this.maxProjects}) — delete a project first`);
    }
    return this.repos.projects.create(
      { id: generateId("project"), name: input.name, description: input.description ?? null },
      userId
    );
  }

  /**
   * Delete a project and everything in it (diagrams + child rows cascade
   * at the database level). Returns false for missing/not-owned projects —
   * callers decide whether that is an error or a silent success.
   */
  async remove(projectId: string, userId: string): Promise<boolean> {
    const owned = await this.repos.projects.findOwned(projectId, userId);
    if (!owned) return false;
    await this.repos.withTransaction(async (tx) => {
      await tx.projects.remove(projectId);
    });
    return true;
  }
}