import type {
  Architecture,
  ArchitectureAttribute,
  ArchitectureMethod,
  ArchitectureNode,
  ArchitectureNodeKind,
  ArchitectureRelationship,
  ArchitectureRelationshipType,
  Visibility,
} from "@/types/diagram";
import { createNode, createRelationship } from "@/lib/architecture/model";

/**
 * Pure, deterministic mutations on the canonical Architecture model.
 *
 * The visual editor (canvas + properties panel + palette) is the ONLY
 * consumer of these helpers: every edit produces a NEW Architecture and
 * is immediately serialized through architectureToMermaid() and persisted
 * by the storage facade — the canonical model stays the single source of
 * truth at all times.
 */

export interface NodeEditPatch {
  name?: string;
  kind?: ArchitectureNodeKind;
  stereotype?: string | null;
  /** C4 container reparenting (null = move to top level). */
  parentId?: string | null;
  isAbstract?: boolean;
  isInterface?: boolean;
  attributes?: ArchitectureAttribute[];
  methods?: ArchitectureMethod[];
  notes?: string[];
  style?: {
    fill?: string;
    border?: string;
    fontSize?: number;
    width?: number;
    height?: number;
  };
}

export interface RelationshipEditPatch {
  type?: ArchitectureRelationshipType;
  label?: string | null;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  action?: string | null;
  sourceRole?: string | null;
  targetRole?: string | null;
  style?: {
    color?: string;
    width?: number;
    dash?: string;
    routing?: "orthogonal" | "straight" | "curved";
  };
  waypoints?: Array<{ x: number; y: number }>;
}

const NODE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function sanitizeNodeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[0-9]+/, "");
  return cleaned.length > 0 && NODE_NAME_RE.test(cleaned) ? cleaned : "Node";
}

export function uniqueNodeName(arch: Architecture, base: string): string {
  const names = new Set(arch.nodes.map((n) => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

function nodeFromKind(name: string, kind: ArchitectureNodeKind): ArchitectureNode {
  const node = createNode(name, kind);
  if (kind === "interface") {
    node.stereotype = "interface";
    node.isInterface = true;
  } else if (kind === "abstract") {
    node.stereotype = "abstract";
    node.isAbstract = true;
  } else if (kind === "entity" || kind === "table") {
    node.stereotype = kind === "table" ? "table" : "entity";
  } else if (UML_SHAPE_STEREOTYPE_KINDS.has(kind)) {
    // UML shape-library kinds round-trip through Mermaid via their stereotype.
    node.stereotype = kind;
  }
  return node;
}

const UML_SHAPE_STEREOTYPE_KINDS = new Set<ArchitectureNodeKind>([
  "usecase",
  "note",
  "constraint",
  "lifeline",
  "start",
  "end",
  "decision",
  "activity",
  "fork",
  "initial",
  "final",
  "swimlane",
  "node",
  "artifact",
  "port",
  "weak-entity",
  "attribute",
  "derived-attribute",
  "relationship",
  "weak-relationship",
  "cloud",
  "parallelogram",
  "document",
  "circle",
  "diamond",
  "rect",
  "rounded-rect",
  "activation",
  "fragment",
  "destroy",
  "message",
  "return-message",
  "self-message",
  "transition",
]);

/** Add a node. Returns the new node (id === name). */
export function addArchitectureNode(
  arch: Architecture,
  kind: ArchitectureNodeKind,
  baseName?: string,
  opts?: { parentId?: string | null }
): { arch: Architecture; node: ArchitectureNode } {
  const name = uniqueNodeName(arch, sanitizeNodeName(baseName ?? kindName(kind)));
  const node = nodeFromKind(name, kind);
  // Only attach when the container actually exists — never orphan a node.
  if (opts?.parentId && arch.nodes.some((n) => n.id === opts.parentId)) {
    node.parentId = opts.parentId;
  }
  return { arch: { ...arch, nodes: [...arch.nodes, node] }, node };
}

function kindName(kind: ArchitectureNodeKind): string {
  switch (kind) {
    case "interface":
      return "NewInterface";
    case "actor":
      return "NewActor";
    case "database":
      return "NewDatabase";
    case "controller":
      return "NewController";
    case "service":
      return "NewService";
    case "repository":
      return "NewRepository";
    case "entity":
      return "NewEntity";
    case "usecase":
      return "NewUseCase";
    case "note":
      return "Note";
    case "constraint":
      return "{ constraint }";
    case "lifeline":
      return "NewLifeline";
    case "activity":
      return "NewActivity";
    case "swimlane":
      return "NewSwimlane";
    case "node":
      return "NewNode";
    case "artifact":
      return "artifact.jar";
    case "port":
      return "port";
    case "weak-entity":
      return "NewWeakEntity";
    case "attribute":
      return "NewAttribute";
    case "derived-attribute":
      return "NewDerived";
    case "relationship":
      return "Relationship";
    case "weak-relationship":
      return "WeakRelationship";
    case "cloud":
      return "Cloud";
    case "parallelogram":
      return "Action";
    case "document":
      return "Document";
    case "circle":
      return "Circle";
    case "diamond":
      return "Decision";
    case "rect":
      return "Rectangle";
    case "rounded-rect":
      return "Process";
    case "activation":
      return "Activation";
    case "fragment":
      return "Fragment";
    case "destroy":
      return "Destroy";
    case "message":
      return "Message";
    case "return-message":
      return "ReturnMessage";
    case "self-message":
      return "SelfMessage";
    case "transition":
      return "Transition";
    default:
      return "NewClass";
  }
}

export function updateArchitectureNode(arch: Architecture, id: string, patch: NodeEditPatch): { arch: Architecture; id: string } {
  const existing = arch.nodes.find((n) => n.id === id);
  if (!existing) return { arch, id };

  const next: ArchitectureNode = {
    ...existing,
    attributes: [...existing.attributes],
    methods: [...existing.methods],
    notes: [...existing.notes],
  };

  if (patch.name !== undefined) {
    next.name = uniqueNodeName(arch, sanitizeNodeName(patch.name));
    next.id = next.name;
  }
  if (patch.stereotype !== undefined) next.stereotype = patch.stereotype;
  if (patch.parentId !== undefined) {
    // Reparenting guard: never allow self- or descendant-containment cycles.
    next.parentId = patch.parentId && patch.parentId !== id && arch.nodes.some((n) => n.id === patch.parentId)
      ? patch.parentId
      : null;
  }
  if (patch.isAbstract !== undefined) next.isAbstract = patch.isAbstract;
  if (patch.isInterface !== undefined) next.isInterface = patch.isInterface;
  if (patch.kind !== undefined) {
    next.kind = patch.kind;
    if (patch.kind === "interface") {
      next.isInterface = true;
      next.stereotype = "interface";
    } else if (patch.kind === "abstract") {
      next.isAbstract = true;
      next.stereotype = "abstract";
    } else if (patch.kind === "entity" || patch.kind === "table") {
      next.stereotype = patch.kind === "table" ? "table" : "entity";
    } else if (UML_SHAPE_STEREOTYPE_KINDS.has(patch.kind)) {
      next.stereotype = patch.kind;
      next.isAbstract = false;
      next.isInterface = false;
    } else {
      next.isAbstract = false;
      next.isInterface = false;
      if (
        next.stereotype === "interface" ||
        next.stereotype === "abstract" ||
        UML_SHAPE_STEREOTYPE_KINDS.has(next.stereotype as ArchitectureNodeKind)
      ) {
        next.stereotype = null;
      }
    }
  }
  if (patch.attributes !== undefined) next.attributes = patch.attributes;
  if (patch.methods !== undefined) next.methods = patch.methods;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.style !== undefined) next.style = patch.style;

  const nodes = arch.nodes.map((n) => (n.id === id ? next : n));
  const relationships =
    next.name === existing.name
      ? arch.relationships
      : arch.relationships.map((r) =>
          r.source === existing.name
            ? { ...r, source: next.name }
            : r.target === existing.name
              ? { ...r, target: next.name }
              : r
        );

  return { arch: { ...arch, nodes, relationships }, id: next.name };
}

export function removeArchitectureNode(arch: Architecture, id: string): Architecture {
  const node = arch.nodes.find((n) => n.id === id);
  if (!node) return arch;
  return {
    ...arch,
    nodes: arch.nodes.filter((n) => n.id !== id),
    relationships: arch.relationships.filter((r) => r.source !== node.name && r.target !== node.name),
  };
}

export function addArchitectureRelationship(
  arch: Architecture,
  source: string,
  target: string,
  type: ArchitectureRelationshipType,
  opts: { label?: string | null; sourceMultiplicity?: string; targetMultiplicity?: string } = {}
): { arch: Architecture; relationship: ArchitectureRelationship } {
  const relationship = createRelationship(source, target, type, {
    label: opts.label ?? null,
    sourceMultiplicity: opts.sourceMultiplicity ?? "1",
    targetMultiplicity: opts.targetMultiplicity ?? "1",
  });
  return { arch: { ...arch, relationships: [...arch.relationships, relationship] }, relationship };
}

export function updateArchitectureRelationship(arch: Architecture, id: string, patch: RelationshipEditPatch): Architecture {
  return {
    ...arch,
    relationships: arch.relationships.map((r) =>
      r.id === id ? { ...r, ...patch, id: r.id, source: r.source, target: r.target } : r
    ),
  };
}

export function removeArchitectureRelationship(arch: Architecture, id: string): Architecture {
  return { ...arch, relationships: arch.relationships.filter((r) => r.id !== id) };
}

export function parseMethodParameters(text: string): Array<{ name: string; type: string }> {
  if (!text.trim()) return [];
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx < 0) return { name: part, type: "void" };
      return { name: part.slice(0, idx).trim(), type: part.slice(idx + 1).trim() || "void" };
    })
    .filter((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name));
}

export function methodParametersToString(params: Array<{ name: string; type: string }>): string {
  return params.map((p) => (p.type && p.type !== "void" && p.type !== "unknown" ? `${p.name}: ${p.type}` : p.name)).join(", ");
}

export const VISIBILITY_OPTIONS: Array<{ value: Visibility; symbol: string; label: string }> = [
  { value: "public", symbol: "+", label: "Public" },
  { value: "private", symbol: "-", label: "Private" },
  { value: "protected", symbol: "#", label: "Protected" },
];

export function defaultAttribute(name = "field"): ArchitectureAttribute {
  return { name, type: "string", visibility: "public", isStatic: false, isDerived: false };
}

export function defaultMethod(name = "method"): ArchitectureMethod {
  return {
    name,
    parameters: [],
    returnType: "void",
    visibility: "public",
    isStatic: false,
    isAbstract: false,
    isAsync: false,
  };
}

export const KIND_LABELS: Record<ArchitectureNodeKind, string> = {
  class: "Class",
  abstract: "Abstract",
  interface: "Interface",
  enum: "Enum",
  entity: "Entity",
  table: "Table",
  controller: "Controller",
  service: "Service",
  repository: "Repository",
  component: "Component",
  package: "Package",
  actor: "Actor",
  boundary: "Boundary",
  external: "External",
  database: "Database",
  api: "API",
  event: "Event",
  state: "State",
  usecase: "Use Case",
  note: "Note",
  constraint: "Constraint",
  lifeline: "Lifeline",
  start: "Start",
  end: "End",
  decision: "Decision",
  activity: "Activity",
  fork: "Fork/Join",
  initial: "Initial State",
  final: "Final State",
  swimlane: "Swimlane",
  node: "Node",
  artifact: "Artifact",
  port: "Port",
  "weak-entity": "Weak Entity",
  attribute: "Attribute",
  "derived-attribute": "Derived Attribute",
  relationship: "Relationship",
  "weak-relationship": "Weak Relationship",
  cloud: "Cloud",
  parallelogram: "Parallelogram",
  document: "Document",
  circle: "Circle",
  diamond: "Diamond",
  rect: "Rectangle",
  "rounded-rect": "Rounded Rectangle",
  activation: "Activation",
  fragment: "Fragment",
  destroy: "Destroy",
  message: "Message",
  "return-message": "Return Message",
  "self-message": "Self Message",
  transition: "Transition",
};

export const PALETTE_KINDS: Array<{ kind: ArchitectureNodeKind; label: string }> = [
  { kind: "class", label: "Class" },
  { kind: "interface", label: "Interface" },
  { kind: "actor", label: "Actor" },
  { kind: "database", label: "Database" },
  { kind: "controller", label: "Controller" },
  { kind: "service", label: "Service" },
  { kind: "repository", label: "Repository" },
];

export function isUmlRelationshipType(type: ArchitectureRelationshipType | undefined): boolean {
  return (
    type === "association" ||
    type === "dependency" ||
    type === "inheritance" ||
    type === "aggregation" ||
    type === "composition" ||
    type === "implementation"
  );
}