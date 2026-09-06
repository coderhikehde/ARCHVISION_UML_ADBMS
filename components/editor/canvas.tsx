"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeTypes,
  type OnSelectionChangeParams,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArchitectureNodeKind } from "@/types/diagram";
import type { DiagramEngine } from "@/hooks/useDiagram";
import type { UMLFlowEdge, UMLFlowNode } from "@/lib/mermaid/transformer";
import { computeLayeredLayout } from "@/lib/editor/layout";
import type { Point } from "@/lib/editor/orthogonal";
import { EMPTY_COMMENTS, useCommentsStore } from "@/lib/editor/comments";
import { RELATION_GROUPS, RELATION_SPECS_EXTENDED, RELATION_TYPE_ORDER } from "@/lib/editor/relations";
import { StatusBar } from "@/components/editor/status-bar";
import { toast } from "@/components/ui/toast";
import { defaultAttribute, defaultMethod, KIND_LABELS } from "@/lib/architecture/editing";
import { shapeByKind } from "@/lib/editor/shapes";
import { BoxSelect, Clipboard, LayoutGrid, Maximize, MessageSquarePlus, Plus, Trash2 } from "lucide-react";

type UmlRelationType = (typeof RELATION_TYPE_ORDER)[number];

interface CanvasProps {
  diagramId: string;
  engine: DiagramEngine;
}

const NODE_TYPES: NodeTypes = {
  uml: React.lazy(() => import("@/components/editor/uml-shapes")) as unknown as NodeTypes["uml"],
  "actor-node": React.lazy(() =>
    import("@/components/editor/uml-node").then((m) => ({ default: m.UMLActorNodeComponent }))
  ) as unknown as NodeTypes["uml"],
  "database-node": React.lazy(() =>
    import("@/components/editor/uml-node").then((m) => ({ default: m.UMLDatabaseNodeComponent }))
  ) as unknown as NodeTypes["uml"],
  "c4-group": React.lazy(() => import("@/components/editor/c4-group-node")) as unknown as NodeTypes["uml"],
};

const EDGE_TYPES = {
  "uml-edge": React.lazy(() => import("@/components/editor/uml-edge")),
};

function positionKey(diagramId: string): string {
  return `archvision-positions-${diagramId}`;
}

function loadSavedPositions(diagramId: string): Record<string, { x: number; y: number }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(positionKey(diagramId));
    return raw ? (JSON.parse(raw) as Record<string, { x: number; y: number }>) : {};
  } catch {
    return {};
  }
}

function savePositions(diagramId: string, positions: Record<string, { x: number; y: number }>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(positionKey(diagramId), JSON.stringify(positions));
  } catch {
    /* storage full or unavailable — positions are a convenience, not critical */
  }
}

function nodeSignature(nodes: UMLFlowNode[], edges: UMLFlowEdge[]): string {
  const nodePart = nodes
    .map((n) => `${n.id}:${n.type}:${JSON.stringify(n.style ?? {})}`)
    .join(",");
  const edgePart = edges.map((e) => `${e.id}:${e.source}:${e.target}`).join(",");
  return `${nodes.length}|${nodePart}|${edges.length}|${edgePart}`;
}

function ConnectionTypeDialog({
  open,
  sourceLabel,
  targetLabel,
  onCancel,
  onPick,
}: {
  open: boolean;
  sourceLabel: string | null;
  targetLabel: string | null;
  onCancel: () => void;
  onPick: (type: UmlRelationType) => void;
}): React.ReactElement | null {
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/25 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Choose relationship type"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-[380px] rounded-2xl border border-line bg-white p-5 shadow-panel-float">
        <p className="text-[13px] font-bold text-foreground">New relationship</p>
        <p className="mt-1 truncate text-[12px] text-muted-foreground">
          {sourceLabel} <span className="mx-1 text-slate-400">â†’</span> {targetLabel}
        </p>
        <div className="mt-4 grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
          {RELATION_GROUPS.map((group) => {
            const types = RELATION_TYPE_ORDER.filter(
              (t) => RELATION_SPECS_EXTENDED[t].group === group.id
            );
            if (types.length === 0) return null;
            return (
              <div key={group.id}>
                <p className="mb-1.5 mt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                {types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onPick(type)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-left text-[12.5px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="w-24 shrink-0 font-mono text-[11px] text-primary">
                      {RELATION_SPECS_EXTENDED[type].mermaid}
                    </span>
                    <span className="flex-1">{RELATION_SPECS_EXTENDED[type].label}</span>
                    <span className="hidden text-[10.5px] font-normal text-slate-400 md:block">
                      {RELATION_SPECS_EXTENDED[type].description}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-xl border border-line py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------------- clipboard & helpers ---------------- */

interface ClipNode {
  name: string;
  kind: UMLFlowNode["data"]["kind"];
  stereotype: string | null;
  isAbstract: boolean;
  isInterface: boolean;
  attributes: UMLFlowNode["data"]["attributes"];
  methods: UMLFlowNode["data"]["methods"];
  position: { x: number; y: number };
}

interface ClipEdge {
  source: string;
  target: string;
  type: string;
  label?: string | null;
}

let clipboard: { nodes: ClipNode[]; edges: ClipEdge[] } | null = null;

const NODE_WIDTH = 232;

function estimateNodeHeight(node: UMLFlowNode): number {
  if (node.measured?.height) return node.measured.height;
  return Math.max(72, 64 + (node.data.attributes.length + node.data.methods.length) * 21);
}

function nodeSize(node: UMLFlowNode): { w: number; h: number } {
  return { w: node.measured?.width ?? NODE_WIDTH, h: estimateNodeHeight(node) };
}

interface Guide {
  pos: number;
  from: number;
  to: number;
}

interface GuideState {
  v: Guide | null;
  h: Guide | null;
}

interface EdgeMenuState {
  x: number;
  y: number;
  edgeId: string;
}

interface QuickCreateState {
  nodeId: string;
  x: number;
  y: number;
}

interface WaypointDragState {
  edgeId: string;
  index: number;
  startClient: { x: number; y: number };
  startFlow: Point;
}

const QUICK_CREATE_KINDS: Array<ArchitectureNodeKind> = [
  "class",
  "interface",
  "abstract",
  "entity",
  "controller",
  "service",
  "repository",
  "component",
  "actor",
  "database",
  "api",
  "event",
];

function CanvasInner({ diagramId, engine }: CanvasProps): React.ReactElement {
  const { fitView, screenToFlowPosition, zoomIn, zoomOut, setViewport, getViewport } = useReactFlow<UMLFlowNode, UMLFlowEdge>();
  const [flowNodes, setFlowNodes] = React.useState<UMLFlowNode[]>(engine.nodes);
  const [flowEdges, setFlowEdges] = React.useState<UMLFlowEdge[]>(engine.edges);
  const [pendingConnection, setPendingConnection] = React.useState<Connection | null>(null);
  const [guides, setGuides] = React.useState<GuideState>({ v: null, h: null });
  const [menu, setMenu] = React.useState<{ x: number; y: number; flow: XYPosition; target: "pane" } | null>(null);
  const [edgeMenu, setEdgeMenu] = React.useState<EdgeMenuState | null>(null);
  const [quickCreate, setQuickCreate] = React.useState<QuickCreateState | null>(null);
  const [waypointDrag, setWaypointDrag] = React.useState<WaypointDragState | null>(null);
  const savedRef = React.useRef(loadSavedPositions(diagramId));
  const flowNodesRef = React.useRef(flowNodes);
  flowNodesRef.current = flowNodes;
  const flowEdgesRef = React.useRef(flowEdges);
  flowEdgesRef.current = flowEdges;

  const comments = useCommentsStore((s) => s.comments[diagramId] ?? EMPTY_COMMENTS);
  const setCommentsOpen = useCommentsStore((s) => s.setOpen);
  const addComment = useCommentsStore((s) => s.addComment);
  const focusComment = useCommentsStore((s) => s.focusComment);

  const signature = nodeSignature(engine.nodes, engine.edges);

  React.useEffect(() => {
    const saved = savedRef.current;
    const positions = new Map(engine.nodes.map((n) => [n.id, saved[n.id] ?? n.position]));
    setFlowNodes(
      engine.nodes.map((n) => {
        const arch = engine.architecture.nodes.find((a) => a.id === n.id);
        const rels = engine.architecture.relationships;
        const inDegree = rels.filter((r) => r.target === n.id).length;
        const outDegree = rels.filter((r) => r.source === n.id).length;
        const tone =
          outDegree > 0 && inDegree > 0
            ? "both"
            : outDegree > 0
              ? "out"
              : inDegree > 0
                ? "in"
                : "none";
        return {
          ...n,
          position: positions.get(n.id) ?? n.position,
          style: { ...(n.style ?? {}), ...(arch?.style ?? {}) },
          data: {
            ...n.data,
            style: arch?.style ?? null,
            relationshipTone: tone,
            onRenameNode: (name: string) => engine.updateNode(n.id, { name }),
            onAddAttribute: () => {
              const current = engine.architecture.nodes.find((a) => a.id === n.id);
              engine.updateNode(n.id, {
                attributes: [...(current?.attributes ?? []), defaultAttribute(`field${(current?.attributes.length ?? 0) + 1}`)],
              });
            },
            onAddMethod: () => {
              const current = engine.architecture.nodes.find((a) => a.id === n.id);
              engine.updateNode(n.id, {
                methods: [...(current?.methods ?? []), defaultMethod(`method${(current?.methods.length ?? 0) + 1}`)],
              });
            },
          },
        };
      })
    );
    setFlowEdges(
      engine.edges.map((e) => {
        const rel = engine.architecture.relationships.find((r) => r.id === e.id);
        return {
          ...e,
          data: {
            ...(e.data as Record<string, unknown>),
            orthogonal: true,
            sourceRole: rel?.sourceRole ?? null,
            targetRole: rel?.targetRole ?? null,
            waypoints: rel?.waypoints ?? [],
            ...(rel?.style ?? {}),
            onUpdateLabel: (label: string | null) => engine.updateRelationship(e.id, { label }),
          },
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void fitView({ padding: 0.2, duration: 600 });
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitPositions = React.useCallback(
    (updater: (nodes: UMLFlowNode[]) => UMLFlowNode[]) => {
      setFlowNodes((nds) => {
        const next = updater(nds);
        const positions: Record<string, { x: number; y: number }> = { ...savedRef.current };
        for (const n of next) positions[n.id] = n.position;
        savedRef.current = positions;
        savePositions(diagramId, positions);
        return next;
      });
    },
    [diagramId]
  );

  const onNodesChange = React.useCallback(
    (changes: NodeChange<UMLFlowNode>[]) => {
      setFlowNodes((nds) => {
        const next = applyNodeChanges(changes, nds) as UMLFlowNode[];
        const positionChanges = changes.filter((c) => c.type === "position");
        if (positionChanges.length > 0) {
          const positions: Record<string, { x: number; y: number }> = { ...savedRef.current };
          for (const c of positionChanges) {
            if (c.type === "position" && c.position) positions[c.id] = c.position;
          }
          savedRef.current = positions;
          savePositions(diagramId, positions);
        }
        return next;
      });
    },
    [diagramId]
  );

  const onEdgesChange = React.useCallback((changes: EdgeChange<UMLFlowEdge>[]) => {
    setFlowEdges((eds) => applyEdgeChanges(changes, eds) as UMLFlowEdge[]);
  }, []);

  const onConnect = React.useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setPendingConnection(connection);
  }, []);

  const confirmConnection = React.useCallback(
    (type: UmlRelationType) => {
      const c = pendingConnection;
      setPendingConnection(null);
      if (!c?.source || !c?.target) return;
      engine.addRelationship(c.source, c.target, type);
    },
    [pendingConnection, engine]
  );

  const onNodesDelete = React.useCallback(
    (deleted: UMLFlowNode[]) => {
      for (const node of deleted) engine.removeNode(node.id);
    },
    [engine]
  );

  const onEdgesDelete = React.useCallback(
    (deleted: UMLFlowEdge[]) => {
      for (const edge of deleted) engine.removeRelationship(edge.id);
    },
    [engine]
  );

  const onSelectionChange = React.useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (selectedEdges.length === 1 && selectedNodes.length === 0) {
        engine.setSelection(null, selectedEdges[0].id);
      } else if (selectedNodes.length === 1) {
        engine.setSelection(selectedNodes[0].id, null);
      } else {
        engine.setSelection(null, null);
      }
    },
    [engine]
  );

  /* ---------------- smart guides ---------------- */

  const onNodeDrag = React.useCallback(
    (_event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent, node: UMLFlowNode) => {
      const dragged = node;
      const { w: dw, h: dh } = nodeSize(dragged);
      const x = dragged.position.x;
      const y = dragged.position.y;
      const cx = x + dw / 2;
      const cy = y + dh / 2;
      let snapX: number | null = null;
      let snapY: number | null = null;
      let vGuide: Guide | null = null;
      let hGuide: Guide | null = null;
      const THRESH = 8;

      for (const other of flowNodesRef.current) {
        if (other.id === dragged.id) continue;
        const { w: ow, h: oh } = nodeSize(other);
        const ox = other.position.x;
        const oy = other.position.y;
        const oCx = ox + ow / 2;
        const oCy = oy + oh / 2;

        const vCandidates: Array<[string, number, number]> = [
          ["left", ox, x],
          ["center", oCx, cx],
          ["right", ox + ow, x + dw],
        ];
        for (const [label, value, targetValue] of vCandidates) {
          void label;
          const d = value - targetValue;
          if (Math.abs(d) < THRESH) {
            snapX = d;
            vGuide = {
              pos: value,
              from: Math.min(oy, y),
              to: Math.max(oy + oh, y + dh),
            };
          }
        }
        const hCandidates: Array<[string, number, number]> = [
          ["top", oy, y],
          ["middle", oCy, cy],
          ["bottom", oy + oh, y + dh],
        ];
        for (const [label, value, targetValue] of hCandidates) {
          void label;
          const d = value - targetValue;
          if (Math.abs(d) < THRESH) {
            snapY = d;
            hGuide = {
              pos: value,
              from: Math.min(ox, x),
              to: Math.max(ox + ow, x + dw),
            };
          }
        }
      }

      if (snapX !== null || snapY !== null) {
        const nx = snapX !== null ? x + snapX : x;
        const ny = snapY !== null ? y + snapY : y;
        setFlowNodes((nds) => nds.map((n) => (n.id === dragged.id ? { ...n, position: { x: nx, y: ny } } : n)));
      }
      setGuides({ v: vGuide, h: hGuide });
    },
    []
  );

  const onNodeDragStop = React.useCallback(() => {
    setGuides({ v: null, h: null });
  }, []);

  /* ---------------- selection ops ---------------- */

  const selectedNodes = React.useCallback(() => flowNodesRef.current.filter((n) => n.selected), []);

  const duplicateSelected = React.useCallback(() => {
    const items = selectedNodes();
    if (items.length === 0) {
      toast("error", "Select nodes to duplicate");
      return;
    }
    const map = new Map<string, string>();
    const added: Array<{ name: string; pos: { x: number; y: number } }> = [];
    for (const item of items) {
      const id = engine.addNode(item.data.kind, item.data.label);
      if (!id) continue;
      map.set(item.id, id);
      engine.updateNode(id, {
        attributes: item.data.attributes,
        methods: item.data.methods.map((m) => ({ ...m, isAsync: false })),
        stereotype: item.data.stereotype,
        isAbstract: item.data.isAbstract,
        isInterface: item.data.isInterface,
      });
      added.push({ name: id, pos: { x: item.position.x + 40, y: item.position.y + 40 } });
    }
    for (const a of added) savedRef.current[a.name] = a.pos;
    const edges = flowEdges.filter((edge) => map.has(edge.source) && map.has(edge.target));
    for (const edge of edges) {
      const s = map.get(edge.source);
      const t = map.get(edge.target);
      if (!s || !t) continue;
      const data = (edge.data ?? {}) as { relationType?: string; label?: string };
      engine.addRelationship(s, t, (data.relationType ?? "association") as UmlRelationType, {
        label: data.label ?? null,
      });
    }
    savePositions(diagramId, { ...savedRef.current });
    toast("success", `Duplicated ${items.length} node${items.length > 1 ? "s" : ""}`);
  }, [engine, flowEdges, selectedNodes, diagramId]);

  const copySelected = React.useCallback(() => {
    const items = selectedNodes();
    if (items.length === 0) {
      toast("error", "Select nodes to copy");
      return;
    }
    const ids = new Set(items.map((n) => n.id));
    const edges = flowEdges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => {
        const data = (e.data ?? {}) as { relationType?: string; label?: string };
        return { source: e.source, target: e.target, type: data.relationType ?? "association", label: data.label };
      });
    clipboard = {
      nodes: items.map((n) => ({
        name: n.data.label,
        kind: n.data.kind,
        stereotype: n.data.stereotype,
        isAbstract: n.data.isAbstract,
        isInterface: n.data.isInterface,
        attributes: n.data.attributes,
        methods: n.data.methods,
        position: { ...n.position },
      })),
      edges,
    };
    toast("success", `Copied ${items.length} node${items.length > 1 ? "s" : ""}`);
  }, [flowEdges, selectedNodes]);

  const pasteClipboard = React.useCallback(
    (offset: { x: number; y: number } = { x: 40, y: 40 }) => {
      if (!clipboard || clipboard.nodes.length === 0) {
        toast("error", "Nothing to paste");
        return;
      }
      const map = new Map<string, string>();
      const positions: Record<string, { x: number; y: number }> = { ...savedRef.current };
      for (const item of clipboard.nodes) {
        const id = engine.addNode(item.kind, item.name);
        if (!id) continue;
        map.set(item.name, id);
        engine.updateNode(id, {
          attributes: item.attributes,
          methods: item.methods.map((m) => ({ ...m, isAsync: false })),
          stereotype: item.stereotype,
          isAbstract: item.isAbstract,
          isInterface: item.isInterface,
        });
        positions[id] = { x: item.position.x + offset.x, y: item.position.y + offset.y };
      }
      savedRef.current = positions;
      for (const edge of clipboard.edges) {
        const s = map.get(edge.source);
        const t = map.get(edge.target);
        if (!s || !t) continue;
        engine.addRelationship(s, t, (edge.type ?? "association") as UmlRelationType, {
          label: edge.label ?? null,
        });
      }
      savePositions(diagramId, positions);
    },
    [engine, diagramId]
  );

  const cutSelected = React.useCallback(() => {
    const items = selectedNodes();
    if (items.length === 0) {
      toast("error", "Select nodes to cut");
      return;
    }
    copySelected();
    const edgeIds = new Set(flowEdges.filter((e) => items.some((n) => n.id === e.source || n.id === e.target)).map((e) => e.id));
    for (const edge of flowEdges) if (edgeIds.has(edge.id)) engine.removeRelationship(edge.id);
    for (const item of items) engine.removeNode(item.id);
  }, [copySelected, engine, flowEdges, selectedNodes]);

  const selectAll = React.useCallback(() => {
    setFlowNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
  }, []);

  const nudge = React.useCallback(
    (dx: number, dy: number) => {
      commitPositions((nds) =>
        nds.map((n) => (n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n))
      );
    },
    [commitPositions]
  );

  /* ---------------- arrange ops ---------------- */

  const align = React.useCallback(
    (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
      const sel = selectedNodes();
      if (sel.length === 0) {
        toast("error", "Select nodes to align");
        return;
      }
      const sizes = sel.map((n) => ({ n, size: nodeSize(n) }));
      const left = Math.min(...sizes.map((s) => s.n.position.x));
      const top = Math.min(...sizes.map((s) => s.n.position.y));
      const right = Math.max(...sizes.map((s) => s.n.position.x + s.size.w));
      const bottom = Math.max(...sizes.map((s) => s.n.position.y + s.size.h));
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      commitPositions((nds) =>
        nds.map((n) => {
          if (!n.selected) return n;
          const size = nodeSize(n);
          let x = n.position.x;
          let y = n.position.y;
          if (axis === "left") x = left;
          if (axis === "center") x = cx - size.w / 2;
          if (axis === "right") x = right - size.w;
          if (axis === "top") y = top;
          if (axis === "middle") y = cy - size.h / 2;
          if (axis === "bottom") y = bottom - size.h;
          return { ...n, position: { x, y } };
        })
      );
    },
    [commitPositions, selectedNodes]
  );

  const distribute = React.useCallback(
    (axis: "horizontal" | "vertical") => {
      const sel = selectedNodes();
      if (sel.length < 3) {
        toast("error", "Select at least 3 nodes to distribute");
        return;
      }
      const sizes = sel.map((n) => ({ n, size: nodeSize(n) }));
      if (axis === "horizontal") {
        sizes.sort((a, b) => a.n.position.x - b.n.position.x);
        const first = sizes[0];
        const last = sizes[sizes.length - 1];
        const span = last.n.position.x + last.size.w - first.n.position.x;
        const inner = sizes.slice(1, -1);
        const totalW = inner.reduce((acc, s) => acc + s.size.w, 0);
        const gap = (span - totalW) / (inner.length + 1);
        const targets = new Map<string, number>();
        let cursor = first.n.position.x + first.size.w;
        for (const s of inner) {
          targets.set(s.n.id, cursor + gap);
          cursor += gap + s.size.w;
        }
        commitPositions((nds) => nds.map((n) => (targets.has(n.id) ? { ...n, position: { x: targets.get(n.id) as number, y: n.position.y } } : n)));
      } else {
        sizes.sort((a, b) => a.n.position.y - b.n.position.y);
        const first = sizes[0];
        const last = sizes[sizes.length - 1];
        const span = last.n.position.y + last.size.h - first.n.position.y;
        const inner = sizes.slice(1, -1);
        const totalH = inner.reduce((acc, s) => acc + s.size.h, 0);
        const gap = (span - totalH) / (inner.length + 1);
        const targets = new Map<string, number>();
        let cursor = first.n.position.y + first.size.h;
        for (const s of inner) {
          targets.set(s.n.id, cursor + gap);
          cursor += gap + s.size.h;
        }
        commitPositions((nds) => nds.map((n) => (targets.has(n.id) ? { ...n, position: { x: n.position.x, y: targets.get(n.id) as number } } : n)));
      }
    },
    [commitPositions, selectedNodes]
  );

  const layoutDirRef = React.useRef<"LR" | "TB">("LR");
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("archvision-layout-direction");
      if (saved === "LR" || saved === "TB") layoutDirRef.current = saved;
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const autoLayout = React.useCallback((direction?: "LR" | "TB") => {
    const dir = direction ?? layoutDirRef.current;
    layoutDirRef.current = dir;
    try {
      window.localStorage.setItem("archvision-layout-direction", dir);
    } catch {
      /* localStorage unavailable */
    }
    const sizes = new Map(
      flowNodesRef.current.map((n) => {
        const size = nodeSize(n);
        return [n.id, { id: n.id, width: size.w, height: size.h }];
      })
    );
    const result = computeLayeredLayout(flowNodesRef.current, flowEdges, sizes, dir);
    commitPositions((nds) => nds.map((n) => result.nodes.find((r) => r.id === n.id)?.position ? { ...n, position: (result.nodes.find((r) => r.id === n.id) as { id: string; position: { x: number; y: number } }).position } : n));
    window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 500 });
    }, 80);
  }, [commitPositions, fitView, flowEdges]);

  /* ---------------- sequence participant reorder ---------------- */

  const reorderParticipants = React.useCallback(() => {
    const nodes = flowNodesRef.current;
    if (nodes.length < 2) {
      toast("error", "Need at least 2 participants to reorder");
      return;
    }
    const ids = new Set(nodes.map((n) => n.id));
    const edges = flowEdges.filter(
      (e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target
    );
    const incoming = new Map<string, number>();
    for (const id of ids) incoming.set(id, 0);
    for (const e of edges) incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);

    const order: string[] = [];
    const placed = new Set<string>();
    while (placed.size < ids.size) {
      const ready = nodes
        .map((n) => n.id)
        .filter((id) => !placed.has(id) && (incoming.get(id) ?? 0) === 0);
      if (ready.length === 0) {
        const remaining = nodes.map((n) => n.id).find((id) => !placed.has(id));
        if (remaining) order.push(remaining);
        break;
      }
      for (const id of ready) {
        order.push(id);
        placed.add(id);
        for (const e of edges) {
          if (e.source === id) incoming.set(e.target, (incoming.get(e.target) ?? 1) - 1);
        }
      }
    }
    for (const n of nodes) {
      if (!placed.has(n.id)) order.push(n.id);
    }

    const baseline = Math.min(...nodes.map((n) => n.position.y));
    const gap = 280;
    const targets = new Map<string, { x: number; y: number }>();
    order.forEach((id, i) => targets.set(id, { x: i * gap, y: baseline }));

    commitPositions((nds) =>
      nds.map((n) => (targets.has(n.id) ? { ...n, position: targets.get(n.id) as { x: number; y: number } } : n))
    );
    window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 500 });
    }, 80);
    toast("success", `Reordered ${order.length} participants by message flow`);
  }, [commitPositions, fitView, flowEdges]);

  /* ---------------- window events ---------------- */

  React.useEffect(() => {
    const zoomInListener = (): void => void zoomIn({ duration: 200 });
    const zoomOutListener = (): void => void zoomOut({ duration: 200 });
    const resetListener = (): void => void setViewport({ x: 0, y: 0, zoom: 1 });
    const fitListener = (): void => void fitView({ padding: 0.2, duration: 400 });
    const selectAllListener = (): void => selectAll();
    const duplicateListener = (): void => duplicateSelected();
    const copyListener = (): void => copySelected();
    const cutListener = (): void => cutSelected();
    const pasteListener = (): void => pasteClipboard();
    const nudgeListener = (e: Event): void => {
      const detail = (e as CustomEvent<{ dx: number; dy: number }>).detail;
      nudge(detail.dx, detail.dy);
    };
    const alignListener = (e: Event): void => {
      const detail = (e as CustomEvent<{ axis: "left" | "center" | "right" | "top" | "middle" | "bottom" }>).detail;
      align(detail.axis);
    };
    const distributeListener = (e: Event): void => {
      const detail = (e as CustomEvent<{ axis: "horizontal" | "vertical" }>).detail;
      distribute(detail.axis);
    };
    const autoLayoutListener = (e: Event): void => {
      const detail = (e as CustomEvent<{ direction?: "LR" | "TB" }>).detail;
      autoLayout(detail?.direction);
    };
    const reorderListener = (): void => reorderParticipants();
    const deleteListener = (): void => {
      for (const edge of flowEdgesRef.current) {
        if (edge.selected) engine.removeRelationship(edge.id);
      }
      for (const node of flowNodesRef.current) {
        if (node.selected) engine.removeNode(node.id);
      }
    };

    window.addEventListener("archvision:zoom-in", zoomInListener);
    window.addEventListener("archvision:zoom-out", zoomOutListener);
    window.addEventListener("archvision:zoom-reset", resetListener);
    window.addEventListener("archvision:fit-view", fitListener);
    window.addEventListener("archvision:select-all", selectAllListener);
    window.addEventListener("archvision:duplicate-selected", duplicateListener);
    window.addEventListener("archvision:copy-selected", copyListener);
    window.addEventListener("archvision:cut-selected", cutListener);
    window.addEventListener("archvision:paste", pasteListener);
    window.addEventListener("archvision:nudge", nudgeListener);
    window.addEventListener("archvision:align", alignListener);
    window.addEventListener("archvision:distribute", distributeListener);
    window.addEventListener("archvision:auto-layout", autoLayoutListener);
    window.addEventListener("archvision:reorder-participants", reorderListener);
    window.addEventListener("archvision:delete-selected", deleteListener);
    return () => {
      window.removeEventListener("archvision:zoom-in", zoomInListener);
      window.removeEventListener("archvision:zoom-out", zoomOutListener);
      window.removeEventListener("archvision:zoom-reset", resetListener);
      window.removeEventListener("archvision:fit-view", fitListener);
      window.removeEventListener("archvision:select-all", selectAllListener);
      window.removeEventListener("archvision:duplicate-selected", duplicateListener);
      window.removeEventListener("archvision:copy-selected", copyListener);
      window.removeEventListener("archvision:cut-selected", cutListener);
      window.removeEventListener("archvision:paste", pasteListener);
      window.removeEventListener("archvision:nudge", nudgeListener);
      window.removeEventListener("archvision:align", alignListener);
      window.removeEventListener("archvision:distribute", distributeListener);
      window.removeEventListener("archvision:auto-layout", autoLayoutListener);
      window.removeEventListener("archvision:reorder-participants", reorderListener);
      window.removeEventListener("archvision:delete-selected", deleteListener);
    };
  }, [zoomIn, zoomOut, setViewport, fitView, selectAll, duplicateSelected, copySelected, cutSelected, pasteClipboard, nudge, align, distribute, autoLayout, reorderParticipants, engine]);

  /* ---------------- drag & drop & context menu ---------------- */

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/archvision-node");
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as {
          kind: Parameters<DiagramEngine["addNode"]>[0];
          name?: string;
        };
        const id = engine.addNode(payload.kind, payload.name ?? undefined);
        if (id) {
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          savedRef.current[id] = position;
        }
      } catch {
        /* malformed drop payload — ignore */
      }
    },
    [engine, screenToFlowPosition]
  );

  const onPaneContextMenu = React.useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({ x: event.clientX, y: event.clientY, flow, target: "pane" });
    },
    [screenToFlowPosition]
  );

  const onEdgeContextMenu = React.useCallback(
    (event: React.MouseEvent | MouseEvent, edge: UMLFlowEdge) => {
      event.preventDefault();
      setMenu(null);
      setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
    },
    []
  );

  const changeEdgeType = React.useCallback(
    (edgeId: string, type: UmlRelationType) => {
      engine.updateRelationship(edgeId, { type });
      setEdgeMenu(null);
    },
    [engine]
  );

  /* ---------------- waypoint edge editing ---------------- */

  const moveWaypoint = React.useCallback(
    (edgeId: string, index: number, flow: Point): void => {
      setFlowEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                data: {
                  ...(e.data as Record<string, unknown>),
                  waypoints: (e.data as { waypoints?: Point[] }).waypoints?.map((w, i) =>
                    i === index ? flow : w
                  ),
                },
              }
            : e
        )
      );
    },
    []
  );

  React.useEffect(() => {
    if (!waypointDrag) return;
    const onMove = (e: PointerEvent): void => {
      const zoom = getViewport().zoom;
      const dx = (e.clientX - waypointDrag.startClient.x) / zoom;
      const dy = (e.clientY - waypointDrag.startClient.y) / zoom;
      moveWaypoint(waypointDrag.edgeId, waypointDrag.index, {
        x: waypointDrag.startFlow.x + dx,
        y: waypointDrag.startFlow.y + dy,
      });
    };
    const onUp = (): void => {
      const edge = flowEdgesRef.current.find((f) => f.id === waypointDrag.edgeId);
      const wps = (edge?.data as { waypoints?: Point[] })?.waypoints ?? [];
      engine.updateRelationship(waypointDrag.edgeId, { waypoints: wps });
      setWaypointDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [waypointDrag, moveWaypoint, engine, getViewport]);

  const insertWaypoint = React.useCallback(
    (edgeId: string, at: Point) => {
      const edge = flowEdgesRef.current.find((f) => f.id === edgeId);
      const wps = [...((edge?.data as { waypoints?: Point[] })?.waypoints ?? []), at];
      setFlowEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? { ...e, data: { ...(e.data as Record<string, unknown>), waypoints: wps } }
            : e
        )
      );
      engine.updateRelationship(edgeId, { waypoints: wps });
    },
    [engine]
  );

  const removeWaypoint = React.useCallback(
    (edgeId: string, index: number) => {
      const edge = flowEdgesRef.current.find((f) => f.id === edgeId);
      const wps = ((edge?.data as { waypoints?: Point[] })?.waypoints ?? []).filter(
        (_, i) => i !== index
      );
      setFlowEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? { ...e, data: { ...(e.data as Record<string, unknown>), waypoints: wps } }
            : e
        )
      );
      engine.updateRelationship(edgeId, { waypoints: wps });
    },
    [engine]
  );

  const waypointPathPoints = React.useCallback(
    (edge: UMLFlowEdge): Point[] => {
      const nodeById = new Map(flowNodesRef.current.map((n) => [n.id, n]));
      const src = nodeById.get(edge.source);
      const tgt = nodeById.get(edge.target);
      if (!src || !tgt) return [];
      const source: Point = { x: src.position.x + (src.measured?.width ?? 232) / 2, y: src.position.y + (src.measured?.height ?? 80) / 2 };
      const target: Point = { x: tgt.position.x + (tgt.measured?.width ?? 232) / 2, y: tgt.position.y + (tgt.measured?.height ?? 80) / 2 };
      const wps = (edge.data as { waypoints?: Point[] })?.waypoints ?? [];
      return [source, ...wps, target];
    },
    []
  );


  const createConnected = React.useCallback(
    (sourceId: string, kind: ArchitectureNodeKind) => {
      const source = flowNodesRef.current.find((n) => n.id === sourceId);
      const anchor = source?.position ?? { x: 0, y: 0 };
      const offset = { x: anchor.x + (source ? nodeSize(source).w : 240) + 48, y: anchor.y };
      const id = engine.addNode(kind, shapeByKind(kind)?.defaultName ?? KIND_LABELS[kind]);
      if (!id) return;
      savedRef.current[id] = offset;
      savePositions(diagramId, { ...savedRef.current });
      engine.addRelationship(sourceId, id, "association");
      setQuickCreate(null);
      window.setTimeout(() => {
        void fitView({ padding: 0.3, duration: 400 });
      }, 60);
    },
    [engine, diagramId, fitView]
  );

  const addCommentAt = React.useCallback(
    (flow: XYPosition) => {
      addComment(diagramId, { author: "you", text: "", x: flow.x, y: flow.y });
    },
    [addComment, diagramId]
  );

  /* ---------------- render ---------------- */

  const viewport = getViewport();
  const anchoredComments = comments.filter((c) => c.x !== 0 || c.y !== 0);

  return (
    <React.Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Preparing canvas…
        </div>
      }
    >
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2, duration: 600 }}
          onSelectionChange={onSelectionChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_, node) => {
            // C4 drill-down: double-clicking a container focuses its subtree.
            if (engine.canDrillInto(node.id)) engine.drillDown(node.id);
          }}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={() => {
            setEdgeMenu(null);
            setMenu(null);
          }}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodesConnectable
          nodesDraggable
          elementsSelectable
          selectionOnDrag
          panOnDrag={[1, 2]}
          panOnScroll
          zoomOnScroll
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          className="uml-flow h-full w-full"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.6} color="rgba(15,23,42,0.10)" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) => {
              const data = (node as UMLFlowNode).data;
              if (data?.isInterface) return "#93C5FD";
              if (data?.isAbstract) return "#99F6E4";
              return "#DBEAFE";
            }}
          />
        </ReactFlow>

        {anchoredComments.length > 0 ? (
          <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full">
            {anchoredComments.map((c) => {
              const sx = c.x * viewport.zoom + viewport.x;
              const sy = c.y * viewport.zoom + viewport.y;
              return (
                <g key={c.id} className="pointer-events-auto">
                  <circle
                    cx={sx}
                    cy={sy}
                    r={11}
                    fill="#14B8A6"
                    stroke="#fff"
                    strokeWidth={2}
                    className="cursor-pointer drop-shadow-sm"
                    onClick={() => {
                      focusComment(c.id);
                      setCommentsOpen(true);
                    }}
                  />
                  {c.text ? (
                    <circle cx={sx} cy={sy} r={3} fill="#fff" />
                  ) : (
                    <path d={`M ${sx - 3} ${sy + 4} l 2 -2 l 2 2 z`} fill="#fff" transform={`translate(0 0)`} />
                  )}
                </g>
              );
            })}
          </svg>
        ) : null}

        {guides.v || guides.h ? (
          <svg className="pointer-events-none absolute inset-0 z-40 h-full w-full" data-testid="smart-guides">
            {guides.v ? (
              <line
                x1={guides.v.pos * viewport.zoom + viewport.x}
                y1={guides.v.from * viewport.zoom + viewport.y}
                x2={guides.v.pos * viewport.zoom + viewport.x}
                y2={guides.v.to * viewport.zoom + viewport.y}
                stroke="#EC4899"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}
            {guides.h ? (
              <line
                x1={guides.h.from * viewport.zoom + viewport.x}
                y1={guides.h.pos * viewport.zoom + viewport.y}
                x2={guides.h.to * viewport.zoom + viewport.x}
                y2={guides.h.pos * viewport.zoom + viewport.y}
                stroke="#EC4899"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}
          </svg>
        ) : null}

        {(() => {
          const selectedEdge = flowEdges.find((e) => e.id === engine.selectedEdgeId);
          if (!selectedEdge) return null;
          const pts = waypointPathPoints(selectedEdge);
          if (pts.length < 2) return null;
          return (
            <>
              {pts.slice(0, -1).map((a, i) => {
                const b = pts[i + 1];
                const mx = ((a.x + b.x) / 2) * viewport.zoom + viewport.x;
                const my = ((a.y + b.y) / 2) * viewport.zoom + viewport.y;
                return (
                  <button
                    key={`seg-${i}`}
                    type="button"
                    aria-label="Add bend point"
                    title="Add bend point"
                    onClick={() => insertWaypoint(selectedEdge.id, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })}
                    className="absolute z-40 flex h-4 w-4 items-center justify-center rounded-full border border-[#0052CC]/40 bg-white text-[10px] font-bold leading-none text-[#0052CC] opacity-40 transition-opacity hover:opacity-100"
                    style={{ left: mx - 8, top: my - 8 }}
                  >
                    +
                  </button>
                );
              })}
              {pts.slice(1, -1).map((p, i) => {
                const sx = p.x * viewport.zoom + viewport.x;
                const sy = p.y * viewport.zoom + viewport.y;
                const dragging = waypointDrag?.edgeId === selectedEdge.id && waypointDrag.index === i;
                return (
                  <div
                    key={`wp-${i}`}
                    role="button"
                    aria-label={`Drag bend point ${i + 1}, double-click to remove`}
                    title="Drag to reroute · double-click to remove"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setWaypointDrag({ edgeId: selectedEdge.id, index: i, startClient: { x: e.clientX, y: e.clientY }, startFlow: p });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      removeWaypoint(selectedEdge.id, i);
                    }}
                    className={`absolute z-40 h-3 w-3 cursor-move rounded-full border-2 border-[#0052CC] bg-white shadow-sm transition-transform hover:scale-125 ${dragging ? "scale-125 bg-[#0052CC]/20" : ""}`}
                    style={{ left: sx - 6, top: sy - 6 }}
                  />
                );
              })}
            </>
          );
        })()}

        {flowNodes
          .filter((n) => n.selected)
          .map((n) => {
            const size = nodeSize(n);
            const bx = (n.position.x + size.w) * viewport.zoom + viewport.x;
            const by = n.position.y * viewport.zoom + viewport.y;
            return (
              <button
                key={`qc-${n.id}`}
                type="button"
                aria-label={`Add connected shape to ${n.data.label}`}
                onClick={() => setQuickCreate({ nodeId: n.id, x: bx, y: by })}
                className="absolute z-40 flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-white text-primary shadow-sm transition-transform hover:scale-110 hover:bg-primary/5"
                style={{ left: bx - 10, top: by - 10 }}
              >
                <Plus className="h-3 w-3" />
              </button>
            );
          })}

        {quickCreate ? (
          <div
            className="absolute z-50 w-[228px] rounded-xl border border-line bg-white p-2 shadow-panel-float"
            style={{ left: quickCreate.x, top: quickCreate.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Create & connect
            </p>
            <div className="grid grid-cols-2 gap-1">
              {QUICK_CREATE_KINDS.map((kind) => {
                const shape = shapeByKind(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => createConnected(quickCreate.nodeId, kind)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11.5px] font-medium text-foreground transition-colors hover:bg-primary/5"
                  >
                    <span
                      className="h-4 w-4 shrink-0"
                      dangerouslySetInnerHTML={{ __html: shape?.thumbnail ?? "" }}
                    />
                    <span className="truncate">{shape?.label ?? kind}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {edgeMenu ? (
          <div
            className="absolute z-50 w-56 rounded-xl border border-line bg-white py-1 shadow-panel-float"
            style={{ left: edgeMenu.x, top: edgeMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Change type
            </p>
            {RELATION_GROUPS.map((group) => {
              const types = RELATION_TYPE_ORDER.filter(
                (t) => RELATION_SPECS_EXTENDED[t].group === group.id
              );
              if (types.length === 0) return null;
              return (
                <React.Fragment key={group.id}>
                  <p className="px-3 pt-1.5 text-[10px] font-semibold text-slate-300">{group.label}</p>
                  {types.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => changeEdgeType(edgeMenu.edgeId, type)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-foreground hover:bg-surface"
                    >
                      <span className="w-16 shrink-0 font-mono text-[10.5px] text-primary">
                        {RELATION_SPECS_EXTENDED[type].mermaid}
                      </span>
                      {RELATION_SPECS_EXTENDED[type].label}
                    </button>
                  ))}
                </React.Fragment>
              );
            })}
            <div className="my-1 h-px bg-line" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-red-600 hover:bg-red-50"
              onClick={() => {
                engine.removeRelationship(edgeMenu.edgeId);
                setEdgeMenu(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete relationship
            </button>
          </div>
        ) : null}

        {menu ? (
          <div
            className="absolute z-50 w-48 rounded-xl border border-line bg-white py-1 shadow-panel-float"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-foreground hover:bg-surface"
              onClick={() => {
                addCommentAt(menu.flow);
                setMenu(null);
              }}
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-slate-400" /> Add comment here
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-foreground hover:bg-surface disabled:opacity-40"
              disabled={!clipboard}
              onClick={() => {
                pasteClipboard({ x: menu.flow.x, y: menu.flow.y });
                setMenu(null);
              }}
            >
              <Clipboard className="h-3.5 w-3.5 text-slate-400" /> Paste
            </button>
            <div className="my-1 h-px bg-line" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-foreground hover:bg-surface"
              onClick={() => {
                selectAll();
                setMenu(null);
              }}
            >
              <BoxSelect className="h-3.5 w-3.5 text-slate-400" /> Select all
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-foreground hover:bg-surface"
              onClick={() => {
                autoLayout();
                setMenu(null);
              }}
            >
              <LayoutGrid className="h-3.5 w-3.5 text-slate-400" /> Auto layout
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-foreground hover:bg-surface"
              onClick={() => {
                void fitView({ padding: 0.2, duration: 400 });
                setMenu(null);
              }}
            >
              <Maximize className="h-3.5 w-3.5 text-slate-400" /> Fit view
            </button>
          </div>
        ) : null}

        <StatusBar engine={engine} nodeCount={flowNodes.length} edgeCount={flowEdges.length} />

        <ConnectionTypeDialog
          open={pendingConnection !== null}
          sourceLabel={pendingConnection
            ? engine.architecture.nodes.find((n) => n.id === pendingConnection.source)?.name ?? pendingConnection.source
            : null}
          targetLabel={pendingConnection
            ? engine.architecture.nodes.find((n) => n.id === pendingConnection.target)?.name ?? pendingConnection.target
            : null}
          onCancel={() => setPendingConnection(null)}
          onPick={confirmConnection}
        />
      </div>
    </React.Suspense>
  );
}

export function Canvas(props: CanvasProps): React.ReactElement {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
