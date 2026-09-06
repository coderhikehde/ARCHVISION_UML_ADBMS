import type { Repositories, ValidationReportRow } from "@/lib/data/repositories/types";

/**
 * ValidationService — bounded context: validation reports.
 *
 * save() is ATOMIC: the report row + the diagram's isValid/validationScore
 * flags update in one $transaction (was two separate writes; a crash
 * between them left the report and the flags out of sync).
 *
 * The validation COMPUTATION itself (lib/architecture/validate.ts) stays
 * pure and client-independent; this service owns the persistence side.
 */

export interface ValidationResultInput {
  issues: Array<{
    severity: "critical" | "warning" | "info";
    message: string;
    rule: string;
    target: string | null;
  }>;
  score: number;
}

export class ValidationService {
  private readonly repos: Repositories;

  constructor(repos: Repositories) {
    this.repos = repos;
  }

  async save(diagramId: string, result: ValidationResultInput, userId: string): Promise<void> {
    await this.repos.withTransaction(async (tx) => {
      await tx.diagrams.requireOwned(diagramId, userId);
      await tx.validation.save(diagramId, { issues: result.issues, score: result.score });
      await tx.validation.updateDiagramFlags(diagramId, userId, {
        isValid: result.issues.every((i) => i.severity !== "critical"),
        validationScore: result.score,
      });
    });
  }

  async get(diagramId: string, userId: string): Promise<ValidationReportRow | null> {
    // 200 + null (not 404) when no report exists — preserves the client
    // facade contract (getValidation → null) and never distinguishes
    // "no report" from "not yours".
    return this.repos.validation.latest(diagramId, userId);
  }
}