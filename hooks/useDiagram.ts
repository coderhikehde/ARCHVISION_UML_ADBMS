"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import type { Architecture, DiagramType, ValidationResult, ViewMode } from "@/types/diagram";
import { parseArchitectureDiagram } from "@/lib/architecture/parse";
import { validateArchitecture } from "@/lib/architecture/validate";
import { architectureToMermaid, architectureToLegacyForCanvas } from "@/lib/architecture/serialization";
import { architectureToLegacy } from "@/lib/architecture/model";
import { layoutModel, type UMLFlowEdge, type UMLFlowNode } from "@/lib/mermaid/transformer";
import { storage, StorageApiError } from "@/lib/data/storage";
import { debounce } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { DiagramVersion } from "@/lib/architecture/versions";
import { createVersion } from "@/lib/architecture/versions";
import type { ArchitectureChange } from "@/lib/architecture/transforms";
import { applyChanges } from "@/lib/architecture/transforms";
import {
  ancestorChain,
  canDrillInto as canDrillIntoHierarchy,
  focusArchitecture,
} from "@/lib/architecture/hierarchy";
import type { ArchitectureNodeKind, ArchitectureRelationshipType } from "@/types/diagram";
import type { NodeEditPatch, RelationshipEditPatch } from "@/lib/architecture/editing";
import {
  addArchitectureNode,
  addArchitectureRelationship,
  removeArchitectureNode,
  removeArchitectureRelationship,
  updateArchitectureNode,
  updateArchitectureRelationship,
} from "@/lib/architecture/editing";

export interface EditorUIState {
  sidePanel: "ai" | "validation" | null;
  codePanelOpen: boolean;
  analysisOpen: boolean;
  scopeWizardOpen: boolean;
  codeGenOpen: boolean;
  docsOpen: boolean;
  versionOpen: boolean;
  shareOpen: boolean;
  reportOpen: boolean;
  aiGenerateOpen: boolean;
  importOpen: boolean;
  commentsOpen: boolean;
  cheatSheetOpen: boolean;
  adrsOpen: boolean;
  setSidePanel: (panel: EditorUIState["sidePanel"]) => void;
  setCodePanelOpen: (open: boolean) => void;
  setAnalysisOpen: (open: boolean) => void;
  setScopeWizardOpen: (open: boolean) => void;
  setCodeGenOpen: (open: boolean) => void;
  setDocsOpen: (open: boolean) => void;
  setVersionOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;
  setReportOpen: (open: boolean) => void;
  setAiGenerateOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  setCommentsOpen: (open: boolean) => void;
  setCheatSheetOpen: (open: boolean) => void;
  setAdrsOpen: (open: boolean) => void;
}

export const useEditorUI = create<EditorUIState>((set) => ({
  sidePanel: null,
  codePanelOpen: false,
  analysisOpen: false,
  scopeWizardOpen: false,
  codeGenOpen: false,
  docsOpen: false,
  versionOpen: false,
  shareOpen: false,
  reportOpen: false,
  aiGenerateOpen: false,
  importOpen: false,
  commentsOpen: false,
  cheatSheetOpen: false,
  adrsOpen: false,
  setSidePanel: (sidePanel) => set({ sidePanel }),
  setCodePanelOpen: (codePanelOpen) => set({ codePanelOpen }),
  setAnalysisOpen: (analysisOpen) => set({ analysisOpen }),
  setScopeWizardOpen: (scopeWizardOpen) => set({ scopeWizardOpen }),
  setCodeGenOpen: (codeGenOpen) => set({ codeGenOpen }),
  setDocsOpen: (docsOpen) => set({ docsOpen }),
  setVersionOpen: (versionOpen) => set({ versionOpen }),
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setReportOpen: (reportOpen) => set({ reportOpen }),
  setAiGenerateOpen: (aiGenerateOpen) => set({ aiGenerateOpen }),
  setImportOpen: (importOpen) => set({ importOpen }),
  setCommentsOpen: (commentsOpen) => set({ commentsOpen }),
  setCheatSheetOpen: (cheatSheetOpen) => set({ cheatSheetOpen }),
  setAdrsOpen: (adrsOpen) => set({ adrsOpen }),
}));

export interface DiagramEngine {
  diagramId: string;
  name: string;
  type: DiagramType;
  mermaidCode: string;
  viewMode: ViewMode;
  architecture: Architecture;
  model: Parameters<typeof layoutModel>[0];
  nodes: UMLFlowNode[];
  edges: UMLFlowEdge[];
  validation: ValidationResult | null;
  parseError: string | null;
  versions: DiagramVersion[];
  versionCount: number;
  ready: boolean;
  missing: boolean;
  setMermaidCode: (code: string, opts?: { persist?: boolean }) => void;
  applyDiagram: (code: string) => void;
  setViewMode: (mode: ViewMode) => void;
  selectNode: (id: string | null) => void;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  setSelection: (nodeId: string | null, edgeId: string | null) => void;
  isSyncing: boolean;
  applyChanges: (changes: ArchitectureChange[], message: string) => void;
  saveVersionNow: (label?: string) => void;
  restoreVersion: (version: DiagramVersion) => void;
  /* ---- visual editor mutations (canonical model as single source of truth) ---- */
  addNode: (kind: ArchitectureNodeKind, name?: string) => string | null;
  updateNode: (id: string, patch: NodeEditPatch) => string | null;
  removeNode: (id: string) => void;
  addRelationship: (
    source: string,
    target: string,
    type: ArchitectureRelationshipType,
    opts?: { label?: string | null; sourceMultiplicity?: string; targetMultiplicity?: string }
  ) => void;
  updateRelationship: (id: string, patch: RelationshipEditPatch) => void;
  removeRelationship: (id: string) => void;
  /* ---- undo/redo history ---- */
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  isSaving: boolean;
  lastSaved: Date | null;
  /* ---- C4 hierarchy drill-down (Epic 2) ---- */
  /** Focused container id, or null for the full model. */
  focusNodeId: string | null;
  /** Ancestor chain ending at the focused node — breadcrumb order. */
  breadcrumb: Array<{ id: string; name: string }>;
  canDrillInto: (nodeId: string) => boolean;
  drillDown: (nodeId: string) => void;
  drillUpTo: (nodeId: string | null) => void;
}

const HISTORY_LIMIT = 50;

export function useDiagram(diagramId: string): DiagramEngine {
  const [mermaidCode, setMermaidCodeState] = useState("");
  const [viewMode, setMode] = useState<ViewMode>("ENGINEERING");
  const [name, setName] = useState("Untitled");
  const [type, setType] = useState<DiagramType>("CLASS");
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [versions, setVersions] = useState<DiagramVersion[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  /** C4 drill-down focus — null shows the whole model. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const persistRef = useRef(true);
  const hydratedRef = useRef(false);
  const mermaidCodeRef = useRef("");
  /** Optimistic-concurrency token from the last known server state. */
  const updatedAtRef = useRef<string | null>(null);
  /** Last payload confirmed persisted — dedupes autosave after explicit saves. */
  const lastPersistedRef = useRef<{ code: string; viewMode: ViewMode } | null>(null);
  const lastErrorToastAtRef = useRef(0);

  useEffect(() => {
    mermaidCodeRef.current = mermaidCode;
  }, [mermaidCode]);

  /** Record a history snapshot of the CURRENT code (call before applying a change). */
  const pushHistory = useCallback((code: string) => {
    if (!hydratedRef.current) return;
    const list = historyRef.current;
    const atTop = historyIndexRef.current >= list.length - 1;
    if (atTop && list[list.length - 1] === code) return;
    const truncated = list.slice(0, historyIndexRef.current + 1);
    const next = [...truncated, code];
    const capped = next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    const offset = next.length - capped.length;
    historyRef.current = capped;
    historyIndexRef.current = historyIndexRef.current + 1 - offset;
    setHistory(capped);
    setHistoryIndex(historyIndexRef.current);
  }, []);

  const setMermaidCode = useCallback(
    (code: string, opts?: { persist?: boolean }) => {
      if (opts?.persist !== false) persistRef.current = true;
      pushHistory(mermaidCodeRef.current);
      setMermaidCodeState(code);
    },
    [pushHistory]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const diagram = await storage.getDiagram(diagramId);
      if (cancelled) return;
      if (!diagram) {
        setMissing(true);
        setReady(true);
        return;
      }
      hydratedRef.current = true;
      setName(diagram.name);
      setType(diagram.type);
      setMode(diagram.viewMode);
      setMermaidCodeState(diagram.mermaidCode);
      updatedAtRef.current = diagram.updatedAt;
      lastPersistedRef.current = { code: diagram.mermaidCode, viewMode: diagram.viewMode };
      setVersions(await storage.listVersions(diagramId));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [diagramId]);

  const warnSaveFailure = useCallback((err: unknown): void => {
    console.warn("[editor] save failed", err);
    const now = Date.now();
    if (now - lastErrorToastAtRef.current < 10_000) return; // throttle
    lastErrorToastAtRef.current = now;
    toast("error", err instanceof Error && err.message ? `Couldn't save: ${err.message}` : "Couldn't save your changes");
  }, []);

  /**
   * PATCH the server carrying the optimistic-concurrency token. On a lost
   * race (409 conflict) the freshest token is fetched and the write is
   * retried once — the client's code is the newest intent, so after one
   * re-sync this session's edit wins. Returns true when persisted.
   */
  const savePatch = useCallback(
    async (patch: { name?: string; mermaidCode?: string; viewMode?: ViewMode }): Promise<boolean> => {
      const attempt = (): ReturnType<typeof storage.updateDiagram> =>
        storage.updateDiagram(diagramId, {
          ...patch,
          ...(updatedAtRef.current ? { expectedUpdatedAt: updatedAtRef.current } : {}),
        });
      try {
        let updated: Awaited<ReturnType<typeof storage.updateDiagram>>;
        try {
          updated = await attempt();
        } catch (err) {
          if (!(err instanceof StorageApiError) || err.code !== "conflict") throw err;
          const fresh = await storage.getDiagram(diagramId);
          if (!fresh) return false; // deleted elsewhere — nothing to save into
          updatedAtRef.current = fresh.updatedAt;
          updated = await attempt();
        }
        if (updated) updatedAtRef.current = updated.updatedAt;
        if (patch.mermaidCode !== undefined || patch.viewMode !== undefined) {
          lastPersistedRef.current = {
            code: patch.mermaidCode ?? mermaidCodeRef.current,
            viewMode: patch.viewMode ?? lastPersistedRef.current?.viewMode ?? "ENGINEERING",
          };
        } else if (updated) {
          lastPersistedRef.current = { code: updated.mermaidCode, viewMode: updated.viewMode };
        }
        return true;
      } catch (err) {
        warnSaveFailure(err);
        return false;
      }
    },
    [diagramId, warnSaveFailure]
  );

  const persist = useMemo(
    () =>
      debounce((code: string, viewMode: ViewMode) => {
        if (!persistRef.current || !hydratedRef.current) return;
        // Skip when this exact payload is already on the server — explicit
        // saves (applyChanges/restore/undo) trigger the autosave effect too.
        if (lastPersistedRef.current?.code === code && lastPersistedRef.current.viewMode === viewMode) return;
        setIsSaving(true);
        void savePatch({ mermaidCode: code, viewMode })
          .then((ok) => {
            if (ok) setLastSaved(new Date());
          })
          .finally(() => setIsSaving(false));
      }, 600),
    [savePatch]
  );

  /* canonical model — single source of truth, derived from mermaid text */
  const { architecture, error } = useMemo(() => {
    const { architecture, error } = parseArchitectureDiagram(mermaidCode);
    return { architecture, error };
  }, [mermaidCode]);

  // Drill-down is a pure view filter: layout/canvas show the focused
  // subtree, while validation and analysis keep operating on the FULL model.
  const visibleArchitecture = useMemo(() => focusArchitecture(architecture, focusId), [architecture, focusId]);

  // A focus target that no longer exists (deleted/renamed/undo) resets the view.
  useEffect(() => {
    if (focusId && !architecture.nodes.some((n) => n.id === focusId)) setFocusId(null);
  }, [architecture, focusId]);

  useEffect(() => {
    setParseError(error);
  }, [error]);

  const model = useMemo(() => architectureToLegacy(visibleArchitecture), [visibleArchitecture]);

  const { nodes, edges } = useMemo(
    () => layoutModel(model as Parameters<typeof layoutModel>[0], viewMode, "LR"),
    [model, viewMode]
  );

  useEffect(() => {
    const result = validateArchitecture(architecture);
    setValidation(result);
  }, [architecture]);

  useEffect(() => {
    if (persistRef.current && hydratedRef.current) persist(mermaidCode, viewMode);
  }, [mermaidCode, viewMode, persist]);

  const refreshVersions = useCallback(async (): Promise<void> => {
    try {
      setVersions(await storage.listVersions(diagramId));
    } catch {
      // Keep showing the current list on a transient read failure.
    }
  }, [diagramId]);

  const applyDiagram = useCallback((code: string) => {
    pushHistory(mermaidCodeRef.current);
    persistRef.current = true;
    setMermaidCodeState(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushHistory]);

  const setViewMode = useCallback((viewModeToSet: ViewMode) => {
    persistRef.current = true;
    setMode(viewModeToSet);
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, []);

  const setSelection = useCallback((nodeId: string | null, edgeId: string | null) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(edgeId);
  }, []);

  const commitArchitecture = useCallback(
    (next: Architecture) => {
      pushHistory(mermaidCodeRef.current);
      persistRef.current = true;
      setMermaidCodeState(architectureToMermaid(next));
    },
    [pushHistory]
  );

  /* ---- visual editor mutations ---- */

  const addNode = useCallback(
    (kind: ArchitectureNodeKind, name?: string): string | null => {
      // New nodes land inside the currently focused container (C4 context).
      const { arch, node } = addArchitectureNode(architecture, kind, name, { parentId: focusId });
      commitArchitecture(arch);
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      return node.id;
    },
    [architecture, commitArchitecture, focusId]
  );

  const updateNode = useCallback(
    (id: string, patch: NodeEditPatch): string | null => {
      const { arch, id: nextId } = updateArchitectureNode(architecture, id, patch);
      commitArchitecture(arch);
      if (nextId !== id) {
        setSelectedNodeId(nextId);
        setSelectedEdgeId(null);
      }
      return nextId;
    },
    [architecture, commitArchitecture]
  );

  const removeNode = useCallback(
    (id: string) => {
      commitArchitecture(removeArchitectureNode(architecture, id));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [architecture, commitArchitecture]
  );

  const addRelationship = useCallback(
    (
      source: string,
      target: string,
      type: ArchitectureRelationshipType,
      opts?: { label?: string | null; sourceMultiplicity?: string; targetMultiplicity?: string }
    ) => {
      const { arch, relationship } = addArchitectureRelationship(architecture, source, target, type, opts);
      commitArchitecture(arch);
      setSelectedEdgeId(relationship.id);
      setSelectedNodeId(null);
    },
    [architecture, commitArchitecture]
  );

  const updateRelationship = useCallback(
    (id: string, patch: RelationshipEditPatch) => {
      commitArchitecture(updateArchitectureRelationship(architecture, id, patch));
    },
    [architecture, commitArchitecture]
  );

  const removeRelationship = useCallback(
    (id: string) => {
      commitArchitecture(removeArchitectureRelationship(architecture, id));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [architecture, commitArchitecture]
  );

  /* ---- undo/redo ---- */

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    const target = historyRef.current[idx - 1];
    if (target === undefined) return;
    historyIndexRef.current = idx - 1;
    setHistoryIndex(idx - 1);
    persistRef.current = true;
    setMermaidCodeState(target);
  }, []);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const target = historyRef.current[idx + 1];
    if (target === undefined) return;
    historyIndexRef.current = idx + 1;
    setHistoryIndex(idx + 1);
    persistRef.current = true;
    setMermaidCodeState(target);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsSyncing(false), 600);
    return () => clearTimeout(timer);
  }, [mermaidCode]);

  const applyChangesToDiagram = useCallback(
    (changes: ArchitectureChange[], label: string) => {
      const current = parseArchitectureDiagram(mermaidCode).architecture;
      const next = applyChanges(current, changes);
      const code = architectureToMermaid(next);
      const nextVersion = createVersion(versions[0] ?? null, code, current, next, label);
      persistRef.current = true;
      setMermaidCode(code);
      // Persist explicitly (snapshot + code), then refresh — awaiting the
      // writes guarantees the version list can't resolve before the commit.
      void (async () => {
        try {
          await storage.saveVersion(diagramId, nextVersion);
          await savePatch({ mermaidCode: code });
          setLastSaved(new Date());
        } catch (err) {
          warnSaveFailure(err);
        }
        await refreshVersions();
      })();
    },
    [diagramId, mermaidCode, versions, savePatch, warnSaveFailure, refreshVersions]
  );

  const saveVersionNow = useCallback(
    (label?: string) => {
      const current = parseArchitectureDiagram(mermaidCode).architecture;
      const previous = versions[0] ?? null;
      const version = createVersion(previous, mermaidCode, null, current, label);
      void (async () => {
        try {
          await storage.saveVersion(diagramId, version);
          setLastSaved(new Date());
        } catch (err) {
          warnSaveFailure(err);
        }
        await refreshVersions();
      })();
    },
    [diagramId, mermaidCode, versions, warnSaveFailure, refreshVersions]
  );

  const restoreVersion = useCallback(
    (version: DiagramVersion) => {
      persistRef.current = true;
      setMermaidCode(version.mermaidCode);
      const restored = parseArchitectureDiagram(version.mermaidCode).architecture;
      const entry = createVersion(
        versions[0] ?? null,
        version.mermaidCode,
        parseArchitectureDiagram(mermaidCode).architecture,
        restored,
        `Restored ${version.label}`
      );
      void (async () => {
        try {
          await storage.saveVersion(diagramId, entry);
          await savePatch({ mermaidCode: version.mermaidCode });
          setLastSaved(new Date());
        } catch (err) {
          warnSaveFailure(err);
        }
        await refreshVersions();
      })();
    },
    [diagramId, mermaidCode, versions, savePatch, warnSaveFailure, refreshVersions]
  );

  return {
    diagramId,
    name,
    type,
    mermaidCode,
    viewMode,
    architecture,
    model,
    nodes,
    edges,
    validation,
    parseError,
    versions,
    versionCount: versions.length,
    ready,
    missing,
    setMermaidCode,
    applyDiagram,
    setViewMode,
    selectNode,
    selectedNodeId,
    selectedEdgeId,
    setSelection,
    isSyncing,
    applyChanges: applyChangesToDiagram,
    saveVersionNow,
    restoreVersion,
    addNode,
    updateNode,
    removeNode,
    addRelationship,
    updateRelationship,
    removeRelationship,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    isSaving,
    lastSaved,
    focusNodeId: focusId,
    breadcrumb: useMemo(
      () => (focusId ? ancestorChain(architecture, focusId).map((n) => ({ id: n.id, name: n.name })) : []),
      [architecture, focusId]
    ),
    canDrillInto: useCallback((nodeId: string) => canDrillIntoHierarchy(architecture, nodeId), [architecture]),
    drillDown: useCallback(
      (nodeId: string) => {
        if (canDrillIntoHierarchy(architecture, nodeId)) setFocusId(nodeId);
      },
      [architecture]
    ),
    drillUpTo: useCallback((nodeId: string | null) => setFocusId(nodeId), []),
  };
}