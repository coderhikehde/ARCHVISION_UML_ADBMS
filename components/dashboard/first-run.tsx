"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2, Rocket, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { TEMPLATES, type EditorTemplate } from "@/lib/architecture/templates";
import { storage } from "@/lib/data/storage";
import { useWorkspaceStore } from "@/lib/data/workspace-store";
import { NewDiagramModal } from "@/components/dashboard/new-diagram-modal";
import type { DiagramType, Project } from "@/types/diagram";

/** Map a template's mermaid to its stored diagram type. */
function inferDiagramType(code: string): DiagramType {
  if (code.startsWith("classDiagram")) return "CLASS";
  if (code.startsWith("erDiagram")) return "ER";
  if (code.startsWith("sequenceDiagram")) return "SEQUENCE";
  if (code.startsWith("stateDiagram")) return "STATE";
  if (code.startsWith("flowchart") || code.startsWith("graph")) return "ACTIVITY";
  return "CLASS";
}

export function FirstRunOnboarding({ projects }: { projects: Project[] }): React.ReactElement {
  const router = useRouter();
  const [starting, setStarting] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const startFromTemplate = async (template: EditorTemplate): Promise<void> => {
    if (starting) return;
    setStarting(template.id);
    try {
      const code = template.build();
      const project =
        projects[0] ??
        (await storage.createProject({
          name: "My First Project",
          description: "Created from your first diagram.",
        }));
      const diagram = await storage.createDiagram(
        { name: template.name, type: inferDiagramType(code), description: template.description },
        project.id,
        code
      );
      // Keep the workspace store in sync so the dashboard reflects the new
      // project/diagram when the user comes back.
      void useWorkspaceStore.getState().reload();
      router.push(`/editor/${diagram.id}`);
    } catch (err) {
      toast("error", err instanceof Error ? `Couldn't start template: ${err.message}` : "Couldn't start template");
      setStarting(null);
    }
  };

  return (
    <section
      aria-label="Start creating"
      className="mb-12 overflow-hidden rounded-card border border-primary/20 bg-gradient-to-br from-primary/5 via-white to-accent/10 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
          <Rocket className="h-3.5 w-3.5" />
          Your first diagram
        </p>
        <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
          Three ways to start
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          Describe a system in plain language and ArchVision drafts the architecture — or skip
          straight to a starter template and make it yours.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={() => setModalOpen(true)}>
          <Sparkles className="h-4 w-4" />
          Describe a system — AI drafts it
        </Button>
        <Button size="lg" variant="outline" disabled={!!starting} onClick={() => void startFromTemplate(TEMPLATES[0])}>
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Start from a template
        </Button>
      </div>

      <div className="mt-8">
        <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
          Starter templates
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.slice(0, 6).map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={!!starting}
              onClick={() => void startFromTemplate(template)}
              className="group flex items-start gap-3 rounded-xl border border-line bg-white p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[15px] font-bold text-primary transition-transform duration-300 group-hover:scale-110">
                {template.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-bold text-foreground">{template.name}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  {template.description}
                </span>
              </span>
              {starting === template.id ? (
                <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <FilePlus2 className="ml-auto h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <NewDiagramModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
}
