import dagre from "dagre";
import {
  type Edge,
  type Node,
  Position,
} from "@xyflow/react";
import type { UMLAttribute, UMLClass, UMLLink, UMLMethod, UMLModel, ViewMode, ArchitectureNodeKind } from "@/types/diagram";
import { RELATION_SPECS } from "@/types/diagram";
import { inferNodeKind } from "@/lib/architecture/model";

export interface UMLNodeData {
  label: string;
  stereotype: string | null;
  /** C4 container id — kept on node data so canvas round-trips preserve it. */
  parentId: string | null;
  isAbstract: boolean;
  isInterface: boolean;
  kind: ArchitectureNodeKind;
  attributes: UMLAttribute[];
  methods: UMLMethod[];
  viewMode: ViewMode;
}

export type UMLNodeDataWithMeta = UMLNodeData & Record<string, unknown>;

export type UMLFlowNode = Node<UMLNodeDataWithMeta, "uml" | "actor-node" | "database-node" | "c4-group">;
export type UMLFlowEdge = Edge;

export const NODE_TYPE = "uml";

function hideMember<T extends { visibility: string; name: string }>(member: T, viewMode: ViewMode): boolean {
  return viewMode === "EXECUTIVE" && member.visibility === "private";
}

export function applyViewMode(model: UMLModel, viewMode: ViewMode): UMLModel {
  if (viewMode === "ENGINEERING") return model;
  return {
    ...model,
    classes: model.classes.map((cls) => ({
      ...cls,
      attributes: cls.attributes.filter((a) => !hideMember(a, viewMode)),
      methods: cls.methods.filter((m) => !hideMember(m, viewMode)),
    })),
  };
}

function nodeTypeFor(cls: UMLClass): "uml" | "actor-node" | "database-node" {
  if (cls.stereotype === "actor" || inferNodeKind(cls.name, cls.stereotype) === "actor") return "actor-node";
  const kind = inferNodeKind(cls.name, cls.stereotype);
  if (kind === "database" || kind === "table") return "database-node";
  return "uml";
}

function buildNode(cls: UMLClass, position: { x: number; y: number }, viewMode: ViewMode): UMLFlowNode {
  const kind = inferNodeKind(cls.name, cls.stereotype);
  return {
    id: cls.id,
    type: nodeTypeFor(cls),
    position,
    data: {
      label: cls.name,
      stereotype: cls.stereotype,
      parentId: cls.parentId ?? null,
      isAbstract: cls.isAbstract,
      isInterface: cls.isInterface,
      kind,
      attributes: cls.attributes.filter((a) => !hideMember(a, viewMode)),
      methods: cls.methods.filter((m) => !hideMember(m, viewMode)),
      viewMode,
    },
  };
}

export function layoutModel(model: UMLModel, viewMode: ViewMode, direction: "LR" | "TB" = "LR"): { nodes: UMLFlowNode[]; edges: UMLFlowEdge[] } {
  const isCompound = model.classes.some((c) => c.parentId);
  const graph = new dagre.graphlib.Graph({ compound: isCompound });
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 48, ranksep: 96, marginx: 24, marginy: 24 });

  const width = 232;
  // Identify containers (nodes that are parents)
  const childCount = new Map<string, number>();
  for (const cls of model.classes) {
    if (cls.parentId) childCount.set(cls.parentId, (childCount.get(cls.parentId) ?? 0) + 1);
  }
  const isContainer = (id: string) => childCount.has(id);

  for (const cls of model.classes) {
    // Container groups get a larger placeholder; dagre will expand to fit children
    if (isContainer(cls.id)) {
      graph.setNode(cls.id, { width: width + 48, height: 120, label: cls.name });
    } else {
      const visibleAttrs = cls.attributes.filter((a) => !hideMember(a, viewMode));
      const visibleMethods = cls.methods.filter((m) => !hideMember(m, viewMode));
      const rows = visibleAttrs.length + visibleMethods.length;
      const height = Math.max(72, 64 + rows * 21);
      graph.setNode(cls.id, { width, height });
    }
  }
  // Parent-child for compound layout
  for (const cls of model.classes) {
    if (cls.parentId && childCount.has(cls.parentId)) {
      // Only set parent if the parent actually exists as a node (it should, as container)
      if (model.classes.some((c) => c.id === cls.parentId)) {
        graph.setParent(cls.id, cls.parentId);
      }
    }
  }
  for (const link of model.links) {
    graph.setEdge(link.from, link.to);
  }

  dagre.layout(graph);

  const index = new Map<string, number>();
  model.links.forEach((link) => {
    index.set(link.id, index.size);
  });

  const nodes: UMLFlowNode[] = model.classes.map((cls) => {
    const pos = graph.node(cls.id) as { x: number; y: number } | undefined;
    const nodeHeight = graph.node(cls.id).height as number | undefined;
    const nodeWidth = graph.node(cls.id).width as number | undefined;
    if (isContainer(cls.id)) {
      const w = nodeWidth ?? width + 48;
      const h = nodeHeight ?? 120;
      return {
        id: cls.id,
        type: "c4-group",
        position: { x: (pos?.x ?? 0) - w / 2, y: (pos?.y ?? 0) - h / 2 },
        data: {
          label: cls.name,
          childCount: childCount.get(cls.id) ?? 0,
          stereotype: cls.stereotype,
          parentId: cls.parentId ?? null,
          isAbstract: cls.isAbstract,
          isInterface: cls.isInterface,
          kind: inferNodeKind(cls.name, cls.stereotype),
          attributes: [],
          methods: [],
          viewMode,
        },
        style: { width: w, height: h },
      } as UMLFlowNode;
    }
    const node = buildNode(
      cls,
      { x: (pos?.x ?? 0) - width / 2, y: (pos?.y ?? 0) - (nodeHeight ?? 72) / 2 },
      viewMode
    );
    if (cls.parentId && childCount.has(cls.parentId)) {
      (node as unknown as { parentId?: string }).parentId = cls.parentId;
      (node as unknown as { extent?: string }).extent = "parent";
    }
    return node;
  });

  const edges: UMLFlowEdge[] = model.links.map((link) => ({
    id: link.id,
    source: link.from,
    target: link.to,
    type: "uml-edge",
    sourceHandle: "right-source",
    targetHandle: "left-target",
    selectable: true,
    label: link.label ?? undefined,
    data: { relationType: link.type, fromMultiplicity: link.fromMultiplicity, toMultiplicity: link.toMultiplicity },
    style: { stroke: "#94A3B8" },
  }));

  void index;
  return { nodes, edges };
}

export function flowToModel(nodes: UMLFlowNode[], edges: UMLFlowEdge[], fallback: UMLModel): UMLModel {
  const classes: UMLClass[] = nodes.map((node) => ({
    id: node.id,
    name: node.data.label,
    stereotype: node.data.stereotype,
    parentId: node.data.parentId ?? null,
    attributes: node.data.attributes,
    methods: node.data.methods,
    isAbstract: node.data.isAbstract,
    isInterface: node.data.isInterface,
  }));

  const known = new Set(classes.map((c) => c.id));
  const links: UMLLink[] = edges
    .filter((e) => known.has(e.source) && known.has(e.target))
    .map((edge) => {
      const data = edge.data as { relationType?: UMLLink["type"] } | undefined;
      return {
        id: edge.id,
        from: edge.source,
        to: edge.target,
        type: data?.relationType ?? "association",
        label: typeof edge.label === "string" && edge.label ? edge.label : null,
        fromMultiplicity: null,
        toMultiplicity: null,
      };
    });

  if (classes.length === 0) return fallback;
  return { title: fallback.title, diagramType: fallback.diagramType, classes, links };
}

export function relationMarker(edge: UMLLink): string {
  return RELATION_SPECS[edge.type].marker;
}

export const NODE_SIZES = { width: 232 };
export { Position };
