import { withApiHandler } from "@/lib/http/with-api-handler";
import { assertDataModeEnabled } from "@/lib/http/data-mode";
import { adrService } from "@/lib/services";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateAdrSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(["proposed","accepted","deprecated","superseded"]).default("proposed"),
  context: z.string().max(5000).default(""),
  decision: z.string().max(5000).default(""),
  consequences: z.string().max(5000).default(""),
  linkedNodes: z.array(z.string()).max(20).default([]),
});

export const GET = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const adrs = await adrService.list(ctx.params.diagramId, ctx.user!.id);
    return ctx.json(adrs);
  },
  { auth: "required", rateLimit: { key: "adrs:list", limit: 60, windowMs: 60_000 }, name: "adrs.list" }
);

export const POST = withApiHandler(
  async (ctx) => {
    assertDataModeEnabled();
    const data = await ctx.body<z.infer<typeof CreateAdrSchema>>();
    const adr = await adrService.create(ctx.params.diagramId, ctx.user!.id, data);
    return ctx.json(adr, { status: 201 });
  },
  { auth: "required", rateLimit: { key: "adrs:create", limit: 30, windowMs: 60_000 }, bodySchema: CreateAdrSchema, name: "adrs.create" }
);
