import { z } from "zod";

/**
 * Version + prompt history + change log schemas.
 *
 * NOTE: the client-supplied `version` number is advisory only — the
 * VersionService always computes the authoritative next version
 * (max existing + 1) inside a transaction, so racing saves can never
 * produce duplicate numbers.
 */

export const VersionCreateSchema = z.object({
  version: z.number().int().min(1).optional(),
  label: z.string().trim().min(1).max(200),
  mermaidCode: z.string().max(100_000),
  summary: z.string().trim().min(1).max(2000),
  changes: z.array(z.string().max(500)).max(200),
});

export const PromptRecordSchema = z.object({
  prompt: z.string().min(1).max(8000),
  response: z.string().max(200_000),
  actionType: z.enum(["generate", "transform", "analyze", "explain"]),
});

export const ChangeRecordSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
});

export const ListChildResourcesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type VersionCreateInput = z.infer<typeof VersionCreateSchema>;
export type PromptRecordInput = z.infer<typeof PromptRecordSchema>;
export type ChangeRecordInput = z.infer<typeof ChangeRecordSchema>;