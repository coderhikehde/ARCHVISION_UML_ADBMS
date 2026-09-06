import type {
  DiagramPatch,
  DiagramRow,
  PromptHistoryRow,
  ChangeRow,
  Repositories,
} from "@/lib/data/repositories/types";
import { generateId } from "@/lib/utils";
import { ConflictError, NotFoundError } from "@/lib/http/api-error";
import { mermaidForType, type DiagramType } from "@/types/diagram";

/**
 * DiagramService — bounded context: diagram lifecycle + child resources
 * (prompt history, change log).
 *
 * Business rules owned here:
 *   - create is ATOMIC: diagram row + first version snapshot + project
 *     updatedAt touch run in one $transaction (was 3 unguarded writes;
 *     a crash between them used to leave an orphaned diagram with no
 *     version 1)
 *   - delete cascades child rows explicitly in a transaction (schema FKs
 *     remain as backstop)
 *   - ownership: every read/write is scoped to the caller; missing and
 *     not-yours produce the SAME NotFound signal (no existence leak)
 *   - optimistic concurrency on update: when the caller passes
 *     `expectedUpdatedAt`, a stale write gets 409 Conflict
 */

export interface DiagramCreateDraft {
  name: string;
  type: DiagramType;
  description?: string;
  mermaidCode?: string;
}

export class DiagramService {
  private readonly repos: Repositories;

  constructor(repos: Repositories) {
    this.repos = repos;
  }

  async list(
    userId: string,
    projectId: string | null,
    pagination?: { limit?: number; offset?: number }
  ): Promise<DiagramRow[]> {
    return this.repos.diagrams.list(projectId, userId, pagination?.limit, pagination?.offset);
  }

  async get(id: string, userId: string): Promise<DiagramRow | null> {
    return this.repos.diagrams.get(id, userId);
  }

  async create(
    draft: DiagramCreateDraft,
    projectId: string,
    userId: string
  ): Promise<DiagramRow> {
    return this.repos.withTransaction(async (tx) => {
      const project = await tx.projects.findOwned(projectId, userId);
      if (!project) throw new NotFoundError();

      const diagramId = generateId("diagram");
      const code = draft.mermaidCode ?? mermaidForType(draft.type);
      const diagram = await tx.diagrams.create({
        id: diagramId,
        name: draft.name,
        type: draft.type,
        projectId,
        mermaidCode: code,
        viewMode: "ENGINEERING",
        isValid: false,
        validationScore: null,
      });
      // First snapshot must never be missing — same transaction as the row.
      await tx.versions.create({
        diagramId,
        version: 1,
        label: "Version 1",
        mermaidCode: code,
        summary: "Initial snapshot",
        changes: ["Initial snapshot"],
      });
      await tx.projects.touch(projectId);
      return diagram;
    });
  }

  async update(
    id: string,
    patch: DiagramPatch,
    userId: string,
    expectedUpdatedAt?: string
  ): Promise<DiagramRow | null> {
    // The optimistic-concurrency token is enforced INSIDE the repository's
    // conditional write (WHERE updatedAt = expected), so a concurrent
    // modification can never slip between check and write.
    const updated = await this.repos.diagrams.update(id, patch, userId, expectedUpdatedAt);
    if (!updated && expectedUpdatedAt) {
      // Distinguish "not yours/missing" (null row, no error) from a lost
      // concurrency race only when the caller asked for the check.
      const existing = await this.repos.diagrams.get(id, userId);
      if (existing) {
        throw new ConflictError("Diagram was modified by another session — reload and retry");
      }
      return null;
    }
    return updated;
  }

  async remove(id: string, userId: string): Promise<boolean> {
    return this.repos.withTransaction(async (tx) => {
      const existing = await tx.diagrams.get(id, userId);
      if (!existing) return false;
      await tx.diagrams.deleteCascade(id);
      return true;
    });
  }

  async recordPrompt(
    diagramId: string,
    entry: { prompt: string; response: string; actionType: "generate" | "transform" | "analyze" | "explain" },
    userId: string
  ): Promise<void> {
    await this.repos.withTransaction(async (tx) => {
      await tx.diagrams.requireOwned(diagramId, userId);
      await tx.diagrams.recordPrompt(diagramId, entry);
    });
  }

  async listPromptHistory(
    diagramId: string,
    userId: string,
    pagination?: { limit?: number; offset?: number }
  ): Promise<PromptHistoryRow[]> {
    return this.repos.diagrams.listPromptHistory(diagramId, userId, pagination?.limit, pagination?.offset);
  }

  async recordChange(diagramId: string, summary: string, userId: string): Promise<void> {
    await this.repos.withTransaction(async (tx) => {
      await tx.diagrams.requireOwned(diagramId, userId);
      await tx.diagrams.recordChange(diagramId, summary);
    });
  }

  async listChanges(
    diagramId: string,
    userId: string,
    pagination?: { limit?: number; offset?: number }
  ): Promise<ChangeRow[]> {
    return this.repos.diagrams.listChanges(diagramId, userId, pagination?.limit, pagination?.offset);
  }
}