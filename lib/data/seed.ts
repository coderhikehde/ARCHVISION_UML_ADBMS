import "@/lib/db";
import { db } from "@/lib/db";

/**
 * Demo-data seeding — explicitly invoked, never part of a read path.
 *
 * Run with `npm run db:seed` (wired to prisma/seed.ts) or call
 * `ensureSeeded()` directly from a script/first-run hook. Production
 * repositories do NOT seed themselves: list/create methods only touch
 * real user data, so a fresh database starts empty until a seeding step
 * runs — which is the intended explicit behavior.
 */

const DEMO_USER_ID = "demo-user";
const DEMO_PROJECT_ID = "project_demo_auth";

let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const [user, project] = await Promise.all([
    db.user.findUnique({ where: { id: DEMO_USER_ID } }),
    db.project.findUnique({ where: { id: DEMO_PROJECT_ID } }),
  ]);

  const writes: Array<Promise<unknown>> = [];
  if (!user) {
    writes.push(
      db.user.create({
        data: {
          id: DEMO_USER_ID,
          name: "Demo Explorer",
          email: "demo@archvision.ai",
        },
      })
    );
  }

  if (project) {
    // Backfill: any diagram without a version 1 gets one. Batched so the
    // operation stays fast even on slow connections.
    const missingVersions = await db.diagram.findMany({
      where: { versions: { none: {} } },
      select: { id: true, mermaidCode: true },
    });
    writes.push(
      ...missingVersions.map((diagram) =>
        db.diagramVersion.create({
          data: {
            diagramId: diagram.id,
            version: 1,
            label: "Version 1",
            mermaidCode: diagram.mermaidCode,
            summary: "Initial snapshot",
            changes: ["Initial snapshot"],
          },
        })
      )
    );
    await Promise.all(writes);
    seeded = true;
    return;
  }

  const now = new Date();
  const projectRow = await db.project.create({
    data: {
      id: DEMO_PROJECT_ID,
      name: "Auth Service",
      description: "User authentication & session management system",
      githubRepo: "acme/auth-service",
      githubBranch: "main",
      userId: DEMO_USER_ID,
      createdAt: now,
      updatedAt: now,
    },
  });
  const { mermaidForType } = await import("@/types/diagram");
  writes.push(
    ...(["CLASS", "SEQUENCE"] as const).map(async (type, index) => {
      const diagramId = `diagram_demo_${index}`;
      const code = mermaidForType(type);
      await db.diagram.create({
        data: {
          id: diagramId,
          name: type === "CLASS" ? "Authentication Domain" : "Login Flow",
          type,
          projectId: projectRow.id,
          mermaidCode: code,
          viewMode: "ENGINEERING",
          isValid: true,
          validationScore: null,
        },
      });
      await db.diagramVersion.create({
        data: {
          diagramId,
          version: 1,
          label: "Version 1",
          mermaidCode: code,
          summary: "Initial snapshot",
          changes: ["Initial snapshot"],
        },
      });
    })
  );
  await Promise.all(writes);
  seeded = true;
}

/** One-off maintenance backfill: guarantee every diagram has a version 1. */
export async function backfillVersions(): Promise<void> {
  const diagrams = await db.diagram.findMany();
  await Promise.all(
    diagrams.map(async (diagram) => {
      const count = await db.diagramVersion.count({ where: { diagramId: diagram.id } });
      if (count === 0) {
        await db.diagramVersion.create({
          data: {
            diagramId: diagram.id,
            version: 1,
            label: "Version 1",
            mermaidCode: diagram.mermaidCode,
            summary: "Initial snapshot",
            changes: ["Initial snapshot"],
          },
        });
      }
    })
  );
}