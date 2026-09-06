import { z } from "zod";

/** Validation result resource schemas (POST /diagrams/:id/validation). */

export const ValidationIssueSchema = z.object({
  severity: z.enum(["critical", "warning", "info"]),
  message: z.string().max(500),
  rule: z.string().max(100),
  target: z.string().max(200).nullable(),
});

export const ValidationResultSchema = z.object({
  issues: z.array(ValidationIssueSchema).max(500),
  score: z.number().int().min(0).max(100),
});

export type ValidationResultInput = z.infer<typeof ValidationResultSchema>;