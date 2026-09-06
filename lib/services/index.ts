import "@/lib/db";
import { db } from "@/lib/db";
import { createRepositories } from "@/lib/data/repositories";
import { ProjectService } from "./project.service";
import { DiagramService } from "./diagram.service";
import { ValidationService } from "./validation.service";
import { VersionService } from "./version.service";
import { IdempotencyService } from "./idempotency.service";
import { AiAssistService } from "./ai-assist.service";
import { OrgService } from "./org.service";
import { AuditLogService } from "./audit-log.service";
import { CommentService, AdrService } from "./comment-adr.service";

/**
 * Production wiring — binds the Prisma-backed repositories to the
 * services. Routes import these singletons; tests construct their own
 * services with fake repositories instead.
 */

const repos = createRepositories(db);

export const projectService = new ProjectService(repos);
export const diagramService = new DiagramService(repos);
export const validationService = new ValidationService(repos);
export const versionService = new VersionService(repos);
export const idempotencyService = new IdempotencyService(repos);
export const aiAssistService = new AiAssistService();
export const orgService = new OrgService(repos);
export const auditLogService = new AuditLogService(repos);
export const commentService = new CommentService(repos);
export const adrService = new AdrService(repos);

export * from "./project.service";
export * from "./diagram.service";
export * from "./validation.service";
export * from "./version.service";
export * from "./idempotency.service";
export * from "./ai-assist.service";
export * from "./org.service";
export * from "./audit-log.service";
export * from "./comment-adr.service";