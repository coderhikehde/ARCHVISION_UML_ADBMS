import type {
  Architecture,
  ArchitectureNode,
  ArchitectureNodeKind,
  ArchitectureRelationship,
  ArchitectureRelationshipType,
  DiagramType,
  UMLModel,
  UMLLink,
} from "@/types/diagram";
import { generateId } from "@/lib/utils";

export function createNode(name: string, kind: ArchitectureNodeKind = "class"): ArchitectureNode {
  return {
    id: name,
    name,
    kind,
    stereotype: null,
    parentId: null,
    attributes: [],
    methods: [],
    isAbstract: false,
    isInterface: kind === "interface",
    notes: [],
  };
}

export function createRelationship(
  source: string,
  target: string,
  type: ArchitectureRelationshipType = "association",
  opts: Partial<ArchitectureRelationship> = {}
): ArchitectureRelationship {
  return {
    id: `rel_${generateId("r")}`,
    source,
    target,
    type,
    label: opts.label ?? null,
    sourceMultiplicity: opts.sourceMultiplicity ?? "1",
    targetMultiplicity: opts.targetMultiplicity ?? "1",
    direction: opts.direction ?? "forward",
    action: opts.action ?? null,
    foreignKeyColumn: opts.foreignKeyColumn ?? null,
    description: opts.description ?? null,
  };
}

export function createEmptyArchitecture(diagramType: DiagramType = "CLASS", title = "Untitled"): Architecture {
  return {
    diagramType,
    title,
    nodes: [],
    relationships: [],
    notes: [],
    sourceText: null,
  };
}

const KIND_BY_NAME: Array<[RegExp, ArchitectureNodeKind]> = [
  [/controller$/i, "controller"],
  [/^controller/i, "controller"],
  [/service$/i, "service"],
  [/^service/i, "service"],
  [/repository$/i, "repository"],
  [/^repo/i, "repository"],
  [/database$|^db\b/i, "database"],
  [/interface$/i, "interface"],
  [/abstract$/i, "abstract"],
  [/component$/i, "component"],
  [/package$/i, "package"],
  [/^actor/i, "actor"],
  [/^api|gateway/i, "api"],
  [/handler$/i, "boundary"],
  [/entity$/i, "entity"],
];

const UML_SHAPE_STEREOTYPES: Record<string, ArchitectureNodeKind> = {
  usecase: "usecase",
  note: "note",
  constraint: "constraint",
  lifeline: "lifeline",
  start: "start",
  end: "end",
  decision: "decision",
  activity: "activity",
  fork: "fork",
  initial: "initial",
  final: "final",
  swimlane: "swimlane",
  node: "node",
  artifact: "artifact",
  port: "port",
  "weak-entity": "weak-entity",
  attribute: "attribute",
  "derived-attribute": "derived-attribute",
  relationship: "relationship",
  "weak-relationship": "weak-relationship",
  cloud: "cloud",
  parallelogram: "parallelogram",
  document: "document",
  circle: "circle",
  diamond: "diamond",
  rect: "rect",
  "rounded-rect": "rounded-rect",
  package: "package",
  activation: "activation",
  fragment: "fragment",
  destroy: "destroy",
  message: "message",
  "return-message": "return-message",
  "self-message": "self-message",
  transition: "transition",
};

export function inferNodeKind(name: string, stereotype: string | null = null): ArchitectureNodeKind {
  const st = (stereotype ?? "").toLowerCase();
  if (st === "interface") return "interface";
  if (st === "abstract") return "abstract";
  if (st === "container" || st === "namespace") return "package";
  if (st === "table" || st === "entity") return "table";
  if (st === "controller") return "controller";
  if (st === "service") return "service";
  if (st === "repository") return "repository";
  if (st === "component") return "component";
  if (st === "actor") return "actor";
  if (st === "database" || st === "db") return "database";
  if (st === "enum" || st === "enumeration") return "enum";
  if (st === "boundary") return "boundary";
  if (st === "event") return "event";
  if (st === "state") return "state";
  const shape = UML_SHAPE_STEREOTYPES[st];
  if (shape) return shape;
  for (const [regex, kind] of KIND_BY_NAME) {
    if (regex.test(name)) return kind;
  }
  return "class";
}

export function architectureStats(arch: Architecture): { nodes: number; relationships: number; tables: number; classes: number; controllers: number; services: number; repositories: number } {
  return {
    nodes: arch.nodes.length,
    relationships: arch.relationships.length,
    tables: arch.nodes.filter((n) => n.kind === "table").length,
    classes: arch.nodes.filter((n) => n.kind === "class" || n.kind === "abstract" || n.kind === "interface").length,
    services: arch.nodes.filter((n) => n.kind === "service").length,
    controllers: arch.nodes.filter((n) => n.kind === "controller").length,
    repositories: arch.nodes.filter((n) => n.kind === "repository").length,
  };
}

/* ---------------- Legacy <-> Canonical adapters ---------------- */

export function legacyToArchitecture(model: UMLModel): Architecture {
  const arch = createEmptyArchitecture(model.diagramType, model.title);
  arch.sourceText = null;
  for (const cls of model.classes) {
    arch.nodes.push({
      id: cls.id,
      name: cls.name,
      kind: inferNodeKind(cls.name, cls.stereotype),
      stereotype: cls.stereotype,
      parentId: cls.parentId ?? null,
      attributes: cls.attributes.map((a) => ({
        name: a.name,
        type: a.type,
        visibility: a.visibility,
        isStatic: a.isStatic,
        isDerived: a.isDerived,
        isPrimaryKey: false,
        isForeignKey: false,
        isUnique: false,
        isNullable: true,
        defaultValue: null,
      })),
      methods: cls.methods.map((m) => ({
        name: m.name,
        parameters: m.parameters,
        returnType: m.returnType,
        visibility: m.visibility,
        isStatic: m.isStatic,
        isAbstract: m.isAbstract,
        isAsync: false,
        description: null,
      })),
      isAbstract: cls.isAbstract,
      isInterface: cls.isInterface,
      notes: [],
    });
  }
  for (const link of model.links) {
    arch.relationships.push({
      id: `arch_rel_${arch.relationships.length}`,
      source: link.from,
      target: link.to,
      type: legacyLinkTypeToArch(link.type),
      label: link.label,
      sourceMultiplicity: link.fromMultiplicity ?? "1",
      targetMultiplicity: link.toMultiplicity ?? "1",
      direction: "forward",
      action: link.label ?? null,
      foreignKeyColumn: null,
      description: null,
    });
  }
  return arch;
}

function legacyLinkTypeToArch(type: UMLLink["type"]): ArchitectureRelationshipType {
  switch (type) {
    case "inheritance":
      return "inheritance";
    case "implementation":
      return "implementation";
    case "composition":
      return "composition";
    case "aggregation":
      return "aggregation";
    case "dependency":
      return "dependency";
    default:
      return "association";
  }
}

export function architectureToLegacy(arch: Architecture): UMLModel {
  return {
    title: arch.title,
    diagramType: arch.diagramType === "ER" || arch.diagramType === "SEQUENCE" ? "CLASS" : arch.diagramType,
    classes: arch.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      stereotype: n.stereotype,
      parentId: n.parentId,
      attributes: n.attributes.map((a) => ({
        name: a.name,
        type: a.type,
        visibility: a.visibility,
        isStatic: a.isStatic,
        isDerived: a.isDerived,
      })),
      methods: n.methods.map((m) => ({
        name: m.name,
        parameters: m.parameters,
        returnType: m.returnType,
        visibility: m.visibility,
        isStatic: m.isStatic,
        isAbstract: m.isAbstract,
      })),
      isAbstract: n.isAbstract,
      isInterface: n.isInterface,
    })),
    links: arch.relationships.map((r) => ({
      id: r.id,
      from: r.source,
      to: r.target,
      type: archLinkTypeToLegacy(r.type),
      label: r.label,
      fromMultiplicity: normalizeMultiplicity(r.sourceMultiplicity),
      toMultiplicity: normalizeMultiplicity(r.targetMultiplicity),
    })),
  };
}

function archLinkTypeToLegacy(type: ArchitectureRelationshipType): UMLLink["type"] {
  switch (type) {
    case "inheritance":
      return "inheritance";
    case "implementation":
      return "implementation";
    case "composition":
      return "composition";
    case "aggregation":
      return "aggregation";
    case "dependency":
    case "call":
    case "reference":
    case "flow":
    case "include":
    case "extend":
    case "transition":
    case "return":
      return "dependency";
    default:
      return "association";
  }
}

/* ---------------- Multiplicity helpers ---------------- */

const MULTIPLICITY_RE = /^(\d{1,2}|\*|n|[m])\s*(?:\.\.\s*(\d{1,2}|\*|n|[mn]))?$/;

export function isValidMultiplicity(value: string | null | undefined): value is string {
  if (!value) return false;
  return VALID_MULTIPLICITY(value);
}

function VALID_MULTIPLICITY(value: string): boolean {
  return MULTIPLICITY_RE.test(value.trim());
}

export function normalizeMultiplicity(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/\s+/g, "");
  if (!MULTIPLICITY_RE.test(v)) return null;
  return v;
}

export function multiplicityToCrowfoot(value: string | null | undefined): string {
  switch (normalizeMultiplicity(value)) {
    case "0..*":
    case "*":
    case "n":
      return "}o";
    case "1..*":
      return "}|";
    case "0..1":
      return "|o";
    case "1":
      return "||";
    default:
      return "|o";
  }
}

export function multiplicityToMermaid(value: string | null | undefined): string | null {
  return normalizeMultiplicity(value);
}

export function isEmptyArchitecture(arch: Architecture): boolean {
  return arch.nodes.length === 0 && arch.relationships.length === 0;
}

export function exportArchitectureJson(arch: Architecture): string {
  return JSON.stringify(arch, null, 2);
}