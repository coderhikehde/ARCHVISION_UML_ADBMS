import { z } from "zod";

/**
 * Project resource schemas — shared by route validation and the OpenAPI
 * contract. All string bounds are enforced here (the RPC dispatcher used
 * to trust caller-supplied values via `as` casts).
 */

export const ProjectCreateSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120, "Project name must be 120 characters or fewer"),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer").optional(),
});

export const ListProjectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;