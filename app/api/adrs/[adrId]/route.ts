import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { adrService } from "@/lib/services";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchAdrSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["proposed","accepted","deprecated","superseded"]).optional(),
  context: z.string().max(5000).optional(),
  decision: z.string().max(5000).optional(),
  consequences: z.string().max(5000).optional(),
  linkedNodes: z.array(z.string()).max(20).optional(),
});

export const PATCH = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const patch = await ctx.body<z.infer<typeof PatchAdrSchema>>();
    const updated = await adrService.update(ctx.params.adrId, ctx.user!.id, patch);
    return ctx.json(updated);
  },
  { auth: "required", rateLimit: { key: "adrs:update", limit: 30, windowMs: 60_000 }, bodySchema: PatchAdrSchema, name: "adrs.update" }
);

export const DELETE = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    await adrService.remove(ctx.params.adrId, ctx.user!.id);
    return ctx.json(null);
  },
  { auth: "required", rateLimit: { key: "adrs:delete", limit: 30, windowMs: 60_000 }, name: "adrs.delete" }
);
