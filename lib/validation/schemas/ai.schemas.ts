import { z } from "zod";

/**
 * AI route schemas — moved out of the route files so the contract is
 * shared between validation and the OpenAPI spec, and the payload bounds
 * (which used to live only in the AI routes) are centralized here.
 */

export const AiDescribeRequestSchema = z.object({
  title: z.string().max(300),
  diagramType: z.string().max(40),
  nodes: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        kind: z.string().max(60),
        attributeCount: z.number().int().min(0),
        methodCount: z.number().int().min(0),
      })
    )
    .max(300),
  relationships: z
    .array(
      z.object({
        source: z.string().min(1).max(200),
        target: z.string().min(1).max(200),
        type: z.string().max(40),
        label: z.string().max(300).nullable(),
      })
    )
    .max(600),
  issues: z
    .array(
      z.object({
        severity: z.string().max(20),
        message: z.string().max(500),
      })
    )
    .max(200),
  focus: z.string().max(200).optional(),
});

export const AiChatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  action: z.enum(["generate", "transform", "explain", "analyze", "chat", "why"]),
  mermaid: z.string().optional(),
  selectedNode: z.string().nullable().optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export type AiDescribeRequest = z.infer<typeof AiDescribeRequestSchema>;
export type AiChatRequest = z.infer<typeof AiChatRequestSchema>;