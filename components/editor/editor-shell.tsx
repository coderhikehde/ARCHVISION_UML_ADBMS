"use client";

import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2, Boxes, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { Toolbar } from "@/components/editor/toolbar";
import { Canvas } from "@/components/editor/canvas";
import { PaletteSidebar, MY_TEMPLATES_KEY } from "@/components/editor/palette-sidebar";
import { PropertiesPanel } from "@/components/editor/properties-panel";
import { MonacoPanel } from "@/components/editor/monaco-panel";
import { AISidebar } from "@/components/editor/ai-sidebar";
import { ValidationPanel } from "@/components/editor/validation-panel";
import { AnalysisOverlay } from "@/components/editor/analysis-overlay";
import { CodeGenModal } from "@/components/editor/codegen-modal";
import { DocsModal } from "@/components/editor/docs-modal";
import { ReportModal } from "@/components/editor/report-modal";
import { AdrPanel } from "@/components/editor/adr-panel";
import { MermaidRenderer } from "@/components/editor/mermaid-renderer";
import { VersionHistoryModal } from "@/components/editor/version-history-modal";
import { AIGenerateModal } from "@/components/editor/ai-generate-modal";
import { ImportModal } from "@/components/editor/import-modal";
import { ShareModal } from "@/components/editor/share-modal";
import { CheatSheetModal } from "@/components/editor/cheat-sheet-modal";
import { CommentPanel } from "@/components/editor/comment-panel";
import { useDiagram, useEditorUI } from "@/hooks/useDiagram";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { useCommentsStore } from "@/lib/editor/comments";
import { exportDiagram, type ExportFormat } from "@/lib/export/engine";
import { storage } from "@/lib/data/storage";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { isMermaidModelType } from "@/lib/mermaid/parser";

const MOBILE_GATE_KEY = "archvision:mobile-editor-ok";

/** SSR-safe "is this a phone-ish viewport?" check. */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = (): void => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

export type AiMode = "openai" | "anthropic" | "offline";

function MobileEditorGate({
  onBack,
  onDismiss,
}: {
  onBack: () => void;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-btn-primary">
        <Boxes className="h-8 w-8" />
      </span>
      <h1 className="mt-8 max-w-md text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        The editor works best on a larger screen
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        Diagramming needs a real canvas. Open ArchVision on a tablet or desktop for the full
        experience — your diagrams are safe and will be waiting for you.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button size="lg" onClick={onBack}>
          Back to dashboard
        </Button>
        <Button size="lg" variant="outline" onClick={onDismiss}>
          Continue anyway
        </Button>
      </div>
      <p className="mt-6 max-w-sm text-xs leading-relaxed text-muted-foreground">
        The editor isn&apos;t optimized for phone screens — panels and controls may be hard to use.
      </p>
    </main>
  );
}

export function EditorShell({
  diagramId,
  aiMode,
  user,
}: {
  diagramId: string;
  aiMode: AiMode;
  user: { name?: string | null; email?: string | null; image?: string | null };
}): React.ReactElement | null {
  const router = useRouter();
  const engine = useDiagram(diagramId);
  const ui = useEditorUI();
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null);
  const [overrideBlock, setOverrideBlock] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(true);
  const commentCount = useCommentsStore((s) => s.comments[diagramId]?.length ?? 0);

  useEditorShortcuts(engine);

  const narrow = useNarrowViewport();
  const [mobileDismissed, setMobileDismissed] = React.useState<boolean>(() =>
    typeof window !== "undefined" && window.sessionStorage.getItem(MOBILE_GATE_KEY) === "1"
  );

  React.useEffect(() => {
    const handleNew = (): void => {
      router.push("/dashboard?new=1");
    };
    window.addEventListener("archvision:new-diagram", handleNew);
    const handleTogglePalette = (): void => setPaletteOpen((open) => !open);
    window.addEventListener("archvision:toggle-palette", handleTogglePalette);
    const listeners: Array<[string, () => void]> = [
      ["archvision:toggle-code", () => ui.setCodePanelOpen(!ui.codePanelOpen)],
      ["archvision:ai-sidebar", () => ui.setSidePanel(ui.sidePanel === "ai" ? null : "ai")],
      ["archvision:validate", () => ui.setSidePanel("validation")],
      ["archvision:analyze", () => ui.setAnalysisOpen(true)],
      ["archvision:docs", () => ui.setDocsOpen(true)],
      ["archvision:codegen", () => ui.setCodeGenOpen(true)],
      ["archvision:export", () => window.dispatchEvent(new CustomEvent("archvision:export-menu"))],
    ];
    listeners.forEach(([name, fn]) => window.addEventListener(name, fn));
    return () => {
      window.removeEventListener("archvision:new-diagram", handleNew);
      window.removeEventListener("archvision:toggle-palette", handleTogglePalette);
      listeners.forEach(([name, fn]) => window.removeEventListener(name, fn));
    };
  }, [ui, router]);

  if (narrow && !mobileDismissed) {
    return (
      <MobileEditorGate
        onBack={() => router.push("/dashboard")}
        onDismiss={() => {
          try {
            window.sessionStorage.setItem(MOBILE_GATE_KEY, "1");
          } catch {
            /* sessionStorage unavailable — dismiss for this render only */
          }
          setMobileDismissed(true);
        }}
      />
    );
  }

  const handleExport = async (format: string): Promise<void> => {
    const criticals = engine.validation?.issues.filter((i) => i.severity === "critical").length ?? 0;
    if (criticals > 0 && !overrideBlock && format !== "json" && format !== "mermaid") {
      const proceed = window.confirm(
        `The diagram has ${criticals} critical validation issue(s). Export anyway?`
      );
      if (!proceed) return;
      setOverrideBlock(true);
    }
    const container = canvasRef.current;
    if (!container) return;
    setExporting(format as ExportFormat);
    try {
      await exportDiagram(format as ExportFormat, container, engine.model, {
        filename: `${engine.name.replace(/\s+/g, "-").toLowerCase()}`,
      });
    } catch (err) {
      console.error("Export failed", err);
      toast("error", err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
      return;
    } finally {
      setExporting(null);
    }
    // Persisting the report is a separate concern — its failure must not
    // claim the export itself failed.
    try {
      await storage.saveValidation(diagramId, engine.validation ?? { issues: [], score: 100 });
    } catch (err) {
      console.warn("Validation report not saved", err);
      toast("error", "Diagram exported, but the validation report couldn't be saved");
    }
  };

  if (!engine.ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-sm font-bold text-foreground">Loading diagram…</p>
        </div>
      </main>
    );
  }

  if (engine.missing) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-bold text-foreground">Diagram not found</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-3 text-[13px] font-semibold text-primary hover:underline"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    );
  }

  const isClassModel = isMermaidModelType(engine.mermaidCode);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-white">
      <div className="shrink-0">
        <Navbar user={user} />
        <div className="pt-16">
          <Toolbar
            diagramName={engine.name}
            diagramType={engine.type}
            viewMode={engine.viewMode}
            onViewModeChange={engine.setViewMode}
            validationScore={engine.validation?.score ?? null}
            isValid={engine.validation?.issues.every((i) => i.severity !== "critical") ?? false}
            onExport={(f) => void handleExport(f)}
            codePanelOpen={ui.codePanelOpen}
            onToggleCodePanel={() => ui.setCodePanelOpen(!ui.codePanelOpen)}
            paletteOpen={paletteOpen}
            onTogglePalette={() => setPaletteOpen((open) => !open)}
            engine={engine}
            commentCount={commentCount}
          />
        </div>
      </div>

      {engine.breadcrumb.length > 0 ? (
        <nav
          aria-label="Diagram hierarchy"
          className="flex shrink-0 items-center gap-0.5 border-b border-line bg-surface px-4 py-1.5 text-[12px]"
        >
          <button
            type="button"
            onClick={() => engine.drillUpTo(null)}
            className="rounded-md px-1.5 py-0.5 font-semibold text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
          >
            All levels
          </button>
          {engine.breadcrumb.map((crumb, i) => {
            const last = i === engine.breadcrumb.length - 1;
            return (
              <span key={crumb.id} className="flex items-center gap-0.5">
                <span className="text-slate-300">/</span>
                {last ? (
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-bold text-primary">{crumb.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => engine.drillUpTo(crumb.id)}
                    className="rounded-md px-1.5 py-0.5 font-semibold text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            );
          })}
          <span className="ml-2 text-[11px] text-muted-foreground">double-click a container to drill in</span>
        </nav>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.08)_1px,transparent_0)] bg-[size:24px_24px]">
          {isClassModel ? (
            <Canvas diagramId={diagramId} engine={engine} />
          ) : (
            <div className="h-full">
              <MermaidRenderer code={engine.mermaidCode} />
            </div>
          )}

          {isClassModel ? (
            <PaletteSidebar
              open={paletteOpen}
              onClose={() => setPaletteOpen(false)}
              onApplyTemplate={(code, name) => {
                engine.applyDiagram(code);
                toast("success", `Template “${name}” applied`);
              }}
              onSaveTemplate={(code) => {
                try {
                  const existing = JSON.parse(window.localStorage.getItem(MY_TEMPLATES_KEY) ?? "[]") as Array<{ id: string; name: string; code: string }>;
                  const entry = {
                    id: `t_${Date.now().toString(36)}`,
                    name: engine.name,
                    code,
                  };
                  window.localStorage.setItem(MY_TEMPLATES_KEY, JSON.stringify([entry, ...existing]));
                } catch {
                  /* storage unavailable */
                }
              }}
              mermaidCode={engine.mermaidCode}
            />
          ) : null}
          {isClassModel && !paletteOpen ? (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Show shape palette (Ctrl B)"
              title="Show shape palette (Ctrl B)"
              className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-line bg-white/90 text-slate-500 shadow-card backdrop-blur transition-all duration-200 hover:border-primary/40 hover:text-primary"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          ) : null}
          {isClassModel ? <PropertiesPanel engine={engine} /> : null}

          <div ref={canvasRef} data-mermaid-code={engine.mermaidCode} className="hidden">
            <MermaidRenderer code={engine.mermaidCode} fit={false} />
          </div>

          {engine.isSyncing ? (
            <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-pill border border-line bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-card backdrop-blur">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              syncing…
            </div>
          ) : null}

          {exporting ? (
            <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-pill border border-line bg-white/90 px-4 py-2 text-[12px] font-semibold text-foreground shadow-panel-float backdrop-blur">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Exporting {exporting.toUpperCase()}…
            </div>
          ) : null}
        </div>

        <AnimatePresence>
          {ui.codePanelOpen ? (
            <MonacoPanel
              value={engine.mermaidCode}
              onChange={engine.setMermaidCode}
              error={engine.parseError}
              open
              onClose={() => ui.setCodePanelOpen(false)}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {ui.sidePanel === "ai" ? (
            <AISidebar engine={engine} mode={aiMode} open onClose={() => ui.setSidePanel(null)} />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {ui.sidePanel === "validation" ? (
            <ValidationPanel
              result={engine.validation}
              open
              onClose={() => ui.setSidePanel(null)}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {ui.commentsOpen ? (
            <CommentPanel
              diagramId={diagramId}
              open
              onClose={() => useCommentsStore.getState().setOpen(false)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <AnalysisOverlay open={ui.analysisOpen} onClose={() => ui.setAnalysisOpen(false)} model={engine.model} />
      <CodeGenModal open={ui.codeGenOpen} onOpenChange={ui.setCodeGenOpen} model={engine.model} />
      <AIGenerateModal
        open={ui.aiGenerateOpen}
        onOpenChange={ui.setAiGenerateOpen}
        onApply={(code) => engine.applyDiagram(code)}
      />
      <ImportModal
        open={ui.importOpen}
        onOpenChange={ui.setImportOpen}
        onApply={(code) => engine.applyDiagram(code)}
      />
      <ShareModal
        open={ui.shareOpen}
        onOpenChange={ui.setShareOpen}
        diagramName={engine.name}
      />
      <CheatSheetModal open={ui.cheatSheetOpen} onOpenChange={ui.setCheatSheetOpen} />
      <DocsModal
        open={ui.docsOpen}
        onOpenChange={ui.setDocsOpen}
        mermaidCode={engine.mermaidCode}
        diagramName={engine.name}
        architecture={engine.architecture}
      />
      <ReportModal
        open={ui.reportOpen}
        onOpenChange={ui.setReportOpen}
        diagramId={engine.diagramId}
        diagramName={engine.name}
        architecture={engine.architecture}
      />
      <VersionHistoryModal
        open={ui.versionOpen}
        onOpenChange={ui.setVersionOpen}
        versions={engine.versions}
        onSaveNow={(label) => engine.saveVersionNow(label)}
        onRestore={(version) => engine.restoreVersion(version)}
        onCloseAfterRestore={() => ui.setVersionOpen(false)}
      />
      <AdrPanel
        open={ui.adrsOpen}
        onClose={() => ui.setAdrsOpen(false)}
        diagramId={engine.diagramId}
        diagramName={engine.name}
        nodeNames={engine.architecture.nodes.map((n) => n.name)}
      />
      <CommandPalette />
    </main>
  );
}