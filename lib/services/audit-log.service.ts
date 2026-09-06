import type { AuditLogRow, Repositories } from "@/lib/data/repositories/types";
import { NotFoundError } from "@/lib/http/api-error";

/**
 * AuditLogService — append-only trail for Epic 6 compliance.
 *
 * Every org membership mutation lands here. Reads are member-gated
 * (any role may audit its own org; outsiders see not_found).
 */

export class AuditLogService {
  private readonly repos: Repositories;

  constructor(repos: Repositories) {
    this.repos = repos;
  }

  /** Best-effort append — audit failures must never break the caller. */
  async append(params: {
    organizationId?: string | null;
    userId: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: unknown | null;
  }): Promise<void> {
    try {
      await this.repos.auditLogs.append(params);
    } catch {
      // Audit is observability, not correctness — swallow.
    }
  }

  async listForOrg(
    organizationId: string,
    callerId: string,
    pagination?: { limit?: number; offset?: number }
  ): Promise<AuditLogRow[]> {
    const role = await this.repos.orgs.roleOf(organizationId, callerId);
    if (!role) throw new NotFoundError();
    return this.repos.auditLogs.listForOrg(organizationId, pagination?.limit, pagination?.offset);
  }
}