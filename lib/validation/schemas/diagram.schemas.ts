import { z } from "zod";
import type { DiagramType, ViewMode } from "@/types/diagram";

/**
 * Diagram resource schemas. Bounds mirror the UI constraints (name length,
 * mermaid payload size) and are the authoritative contract for both the
 * REST routes and the OpenAPI spec.
 */

const DIAGRAM_TYPES = [
  "CLASS",
  "SEQUENCE",
  "USE_CASE",
  "STATE",
  "ACTIVITY",
  "COMPONENT",
  "DEPLOYMENT",
  "ER",
  "PACKAGE",
] as const satisfies readonly DiagramType[];

export const DiagramCreateSchema = z.object({
  name: z.string().trim().min(1, "Diagram name is required").max(120, "Diagram name must be 120 characters or fewer"),
  type: z.enum(DIAGRAM_TYPES),
  description: z.string().trim().max(500).optional(),
  mermaidCode: z.string().max(100_000, "Diagram source is too large").optional(),
});

export const DiagramPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    mermaidCode: z.string().max(100_000).optional(),
    viewMode: z.enum(["EXECUTIVE", "ENGINEERING"] as const satisfies readonly ViewMode[]).optional(),
    isValid: z.boolean().optional(),
    validationScore: z.number().int().min(0).max(100).nullable().optional(),
    /** Optimistic concurrency: if present, the update is rejected with 409 when the stored updatedAt differs. */
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one field must be provided",
  });

export const ListDiagramsQuerySchema = z.object({
  projectId: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type DiagramCreateInput = z.infer<typeof DiagramCreateSchema>;
export type DiagramPatchInput = z.infer<typeof DiagramPatchSchema>;