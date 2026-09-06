import type {
  Architecture,
  ArchitectureNode,
  ArchitectureRelationshipType,
} from "@/types/diagram";
import { createRelationship } from "@/lib/architecture/model";
import { detectArchitectureFromText } from "@/lib/architecture/detect";

/* ------------------------------------------------------------------ */
/* ArchitectureChange — every mutation the copilot can make is         */
/* expressed as an immutable "change" with a machine-readable shape,   */
/* an impact analysis, and a deterministic apply() that returns a new  */
/* Architecture. Nothing mutates shared state in place.                */
/* ------------------------------------------------------------------ */

export interface ChangeImpact {
  nodesChanged: string[];
  relationshipsChanged: string[];
  nodesAdded: string[];
  nodesRemoved: string[];
  message: string;
  destructive: boolean;
}

export type ArchitectureChange =
  | { kind: "addNode"; name: string; stereotype?: string | null; connectTo?: string | null }
  | { kind: "removeNode"; name: string }
  | { kind: "renameNode"; from: string; to: string }
  | { kind: "addRelationship"; source: string; target: string; type?: ArchitectureRelationshipType; label?: string | null; targetMultiplicity?: string }
  | { kind: "removeRelationship"; source: string; target: string }
  | { kind: "addMethod"; node: string; method: string; returnType?: string }
  | { kind: "removeMethod"; node: string; method: string }
  | { kind: "addAttribute"; node: string; attribute: string; type?: string }
  | { kind: "removeAttribute"; node: string; attribute: string }
  | { kind: "setMultiplicity"; source: string; target: string; multiplicity: string }
  | { kind: "makeAbstract"; node: string; value: boolean }
  | { kind: "makeInterface"; node: string; value: boolean };

export function describeChange(change: ArchitectureChange): string {
  switch (change.kind) {
    case "addNode":
      return `Add ${change.name}${change.connectTo ? ` and connect to ${change.connectTo}` : ""}`;
    case "removeNode":
      return `Remove ${change.name}`;
    case "renameNode":
      return `Rename ${change.from} → ${change.to}`;
    case "addRelationship":
      return `Add ${change.type ?? "association"} ${change.source} → ${change.target}${change.targetMultiplicity ? ` (${change.targetMultiplicity})` : ""}`;
    case "removeRelationship":
      return `Remove relationship ${change.source} → ${change.target}`;
    case "addMethod":
      return `Add method ${change.node}.${change.method}()`;
    case "removeMethod":
      return `Remove method ${change.node}.${change.method}()`;
    case "addAttribute":
      return `Add attribute ${change.node}.${change.attribute}`;
    case "removeAttribute":
      return `Remove attribute ${change.node}.${change.attribute}`;
    case "setMultiplicity":
      return `Set cardinality ${change.source} → ${change.target} to ${change.multiplicity}`;
    case "makeAbstract":
      return `${change.value ? "Make" : "Un-make"} ${change.node} abstract`;
    case "makeInterface":
      return `${change.value ? "Turn" : "Convert back"} ${change.node} ${change.value ? "into" : "from"} an interface`;
  }
}

export function analyzeImpact(arch: Architecture, change: ArchitectureChange): ChangeImpact {
  const impact: ChangeImpact = {
    nodesChanged: [],
    relationshipsChanged: [],
    nodesAdded: [],
    nodesRemoved: [],
    message: describeChange(change),
    destructive: false,
  };

  switch (change.kind) {
    case "addNode": {
      impact.nodesAdded.push(change.name);
      if (change.connectTo) impact.relationshipsChanged.push(`${change.connectTo} → ${change.name}`);
      break;
    }
    case "removeNode": {
      const rels = arch.relationships.filter((r) => r.source === change.name || r.target === change.name);
      impact.nodesRemoved.push(change.name);
      impact.relationshipsChanged.push(...rels.map((r) => `${r.source} → ${r.target}`));
      impact.destructive = rels.length > 0;
      break;
    }
    case "renameNode": {
      const rels = arch.relationships.filter((r) => r.source === change.from || r.target === change.from);
      impact.nodesChanged.push(change.from);
      impact.relationshipsChanged.push(...rels.map((r) => `${r.source} → ${r.target}`));
      impact.message = `Rename ${change.from} → ${change.to} (affects ${rels.length} relationship${rels.length === 1 ? "" : "s"})`;
      break;
    }
    case "addRelationship":
      impact.relationshipsChanged.push(`${change.source} → ${change.target}`);
      break;
    case "removeRelationship":
      impact.relationshipsChanged.push(`${change.source} → ${change.target}`);
      impact.destructive = true;
      break;
    case "addMethod":
      impact.nodesChanged.push(change.node);
      break;
    case "removeMethod":
      impact.nodesChanged.push(change.node);
      impact.destructive = true;
      break;
    case "addAttribute":
      impact.nodesChanged.push(change.node);
      break;
    case "removeAttribute":
      impact.nodesChanged.push(change.node);
      impact.destructive = true;
      break;
    case "setMultiplicity":
      impact.relationshipsChanged.push(`${change.source} → ${change.target}`);
      break;
    case "makeAbstract":
    case "makeInterface":
      impact.nodesChanged.push(change.node);
      break;
  }
  return impact;
}

export function applyChange(arch: Architecture, change: ArchitectureChange): Architecture {
  const clone: Architecture = {
    ...arch,
    nodes: arch.nodes.map((n) => ({ ...n, attributes: [...n.attributes], methods: [...n.methods], notes: [...n.notes] })),
    relationships: arch.relationships.map((r) => ({ ...r })),
  };
  const findNode = (name: string): ArchitectureNode | null => clone.nodes.find((n) => n.name === name) ?? null;

  switch (change.kind) {
    case "addNode": {
      if (findNode(change.name)) return clone;
      clone.nodes.push({
        id: change.name,
        name: change.name,
        kind: change.stereotype === "table" ? "table" : change.stereotype === "interface" ? "interface" : "class",
        stereotype: change.stereotype ?? null,
        parentId: null,
        attributes: [],
        methods: [],
        isAbstract: change.stereotype === "abstract",
        isInterface: change.stereotype === "interface",
        notes: [],
      });
      if (change.connectTo && findNode(change.connectTo)) {
        clone.relationships.push(
          createRelationship(change.connectTo, change.name, "association", { label: null, sourceMultiplicity: "1", targetMultiplicity: "1" })
        );
      }
      break;
    }
    case "removeNode": {
      clone.nodes = clone.nodes.filter((n) => n.name !== change.name);
      clone.relationships = clone.relationships.filter((r) => r.source !== change.name && r.target !== change.name);
      break;
    }
    case "renameNode": {
      for (const node of clone.nodes) {
        if (node.name === change.from) node.name = change.to;
      }
      for (const rel of clone.relationships) {
        if (rel.source === change.from) rel.source = change.to;
        if (rel.target === change.from) rel.target = change.to;
      }
      break;
    }
    case "addRelationship": {
      if (!findNode(change.source) || !findNode(change.target)) return clone;
      if (clone.relationships.some((r) => r.source === change.source && r.target === change.target)) return clone;
      clone.relationships.push(
        createRelationship(change.source, change.target, change.type ?? "association", {
          label: change.label ?? null,
          targetMultiplicity: change.targetMultiplicity ?? "1",
        })
      );
      break;
    }
    case "removeRelationship": {
      clone.relationships = clone.relationships.filter(
        (r) => !(r.source === change.source && r.target === change.target)
      );
      break;
    }
    case "addMethod": {
      const node = findNode(change.node);
      if (!node || node.methods.some((m) => m.name === change.method)) return clone;
      node.methods.push({
        name: change.method,
        parameters: [],
        returnType: change.returnType ?? "void",
        visibility: "public",
        isStatic: false,
        isAbstract: false,
        isAsync: false,
      });
      break;
    }
    case "removeMethod": {
      const node = findNode(change.node);
      if (!node) return clone;
      node.methods = node.methods.filter((m) => m.name !== change.method);
      break;
    }
    case "addAttribute": {
      const node = findNode(change.node);
      if (!node || node.attributes.some((a) => a.name === change.attribute)) return clone;
      node.attributes.push({
        name: change.attribute,
        type: change.type ?? "string",
        visibility: "public",
        isStatic: false,
        isDerived: false,
        isPrimaryKey: false,
        isForeignKey: false,
        isUnique: false,
        isNullable: true,
        defaultValue: null,
      });
      break;
    }
    case "removeAttribute": {
      const node = findNode(change.node);
      if (!node) return clone;
      node.attributes = node.attributes.filter((a) => a.name !== change.attribute);
      break;
    }
    case "setMultiplicity": {
      const rel = clone.relationships.find((r) => r.source === change.source && r.target === change.target);
      if (rel) rel.targetMultiplicity = change.multiplicity;
      break;
    }
    case "makeAbstract": {
      const node = findNode(change.node);
      if (node) {
        node.isAbstract = change.value;
        node.stereotype = change.value ? "abstract" : null;
      }
      break;
    }
    case "makeInterface": {
      const node = findNode(change.node);
      if (node) {
        node.isInterface = change.value;
        node.stereotype = change.value ? "interface" : null;
      }
      break;
    }
  }
  return clone;
}

export function applyChanges(arch: Architecture, changes: ArchitectureChange[]): Architecture {
  let current = arch;
  for (const change of changes) current = applyChange(current, change);
  return current;
}

/* ------------------------------------------------------------------ */
/* NL command interpretation (offline copilot)                         */
/* ------------------------------------------------------------------ */

export interface ParsedCommand {
  change: ArchitectureChange | null;
  summary: string;
  confidence: number;
}

const caseInsensitive = (re: RegExp): RegExp => new RegExp(re.source, re.flags.replace("g", "") + "i");

export function parseCommand(command: string, arch: Architecture, selectedNode: string | null): ParsedCommand | null {
  const text = command.trim();
  const names = new Set(arch.nodes.map((n) => n.name));

  const addClass = caseInsensitive(/add (?:a |an |new )?(?:class|entity|table|node) ([A-Za-z_][A-Za-z0-9_]*)/);
  let m = addClass.exec(text);
  if (m && !names.has(m[1])) {
    const connectTo = selectedNode && names.has(selectedNode) ? selectedNode : null;
    return { change: { kind: "addNode", name: m[1], connectTo }, summary: `Add node ${m[1]}${connectTo ? ` connected to ${connectTo}` : ""}`, confidence: 0.9 };
  }

  const addRel = caseInsensitive(/(?:connect|link|relate) ([A-Za-z_][A-Za-z0-9_]*) (?:with|to|and) ([A-Za-z_][A-Za-z0-9_]*)/);
  m = addRel.exec(text);
  if (m) {
    const source = pickName(m[1], names) ?? m[1];
    const target = pickName(m[2], names) ?? m[2];
    if (source !== target) {
      return { change: { kind: "addRelationship", source, target, type: "association" }, summary: `Connect ${source} to ${target}`, confidence: 0.85 };
    }
  }

  const inherit = caseInsensitive(/make ([A-Za-z_][A-Za-z0-9_]*) (?:inherit|extend) (?:from )?([A-Za-z_][A-Za-z0-9_]*)/);
  m = inherit.exec(text);
  if (m) {
    const source = pickName(m[1], names) ?? m[1];
    const target = pickName(m[2], names) ?? m[2];
    if (source !== target) {
      return { change: { kind: "addRelationship", source, target, type: "inheritance" }, summary: `${source} inherits from ${target}`, confidence: 0.85 };
    }
  }

  const depends = caseInsensitive(/([A-Za-z_][A-Za-z0-9_]*) depends on ([A-Za-z_][A-Za-z0-9_]*)/);
  m = depends.exec(text);
  if (m) {
    const source = pickName(m[1], names) ?? m[1];
    const target = pickName(m[2], names) ?? m[2];
    if (source !== target) {
      return { change: { kind: "addRelationship", source, target, type: "dependency" }, summary: `${source} depends on ${target}`, confidence: 0.85 };
    }
  }

  const rename = caseInsensitive(/rename ([A-Za-z_][A-Za-z0-9_]*) to ([A-Za-z_][A-Za-z0-9_]*)/);
  m = rename.exec(text);
  if (m) {
    const from = pickName(m[1], names) ?? m[1];
    if (names.has(from)) {
      return { change: { kind: "renameNode", from, to: m[2] }, summary: `Rename ${from} to ${m[2]}`, confidence: 0.9 };
    }
  }

  const remove = caseInsensitive(/remove (?:the )?(?:class|entity|table|node) ([A-Za-z_][A-Za-z0-9_]*)/);
  m = remove.exec(text);
  if (m) {
    const name = pickName(m[1], names) ?? m[1];
    if (names.has(name)) {
      return { change: { kind: "removeNode", name }, summary: `Remove ${name}`, confidence: 0.8 };
    }
  }

  const addMethod = caseInsensitive(/add (?:a )?method ([a-z][A-Za-z0-9_]*) to ([A-Za-z_][A-Za-z0-9_]*)/);
  m = addMethod.exec(text);
  if (m) {
    const target = pickName(m[2], names) ?? m[2];
    if (names.has(target)) {
      return { change: { kind: "addMethod", node: target, method: m[1] }, summary: `Add method ${target}.${m[1]}()`, confidence: 0.85 };
    }
  }

  const addAttr = caseInsensitive(/add (?:a )?(?:attribute|field|property) ([a-z][A-Za-z0-9_]*) to ([A-Za-z_][A-Za-z0-9_]*)/);
  m = addAttr.exec(text);
  if (m) {
    const target = pickName(m[2], names) ?? m[2];
    if (names.has(target)) {
      return { change: { kind: "addAttribute", node: target, attribute: m[1] }, summary: `Add attribute ${target}.${m[1]}`, confidence: 0.85 };
    }
  }

  const many = caseInsensitive(/make ([A-Za-z_][A-Za-z0-9_]*) (?:have|own) (?:many|multiple|one or more) ([A-Za-z_][A-Za-z0-9_]*)/);
  m = many.exec(text);
  if (m) {
    const source = pickName(m[1], names) ?? m[1];
    const target = pickName(m[2], names) ?? m[2];
    if (names.has(source) && names.has(target)) {
      return { change: { kind: "addRelationship", source, target, type: "association", label: "has", targetMultiplicity: "0..*" }, summary: `${source} has many ${target}s (0..*)`, confidence: 0.8 };
    }
  }

  return null;
}

function pickName(token: string, names: Set<string>): string | null {
  if (names.has(token)) return token;
  const lower = token.toLowerCase();
  for (const name of names) {
    if (name.toLowerCase() === lower) return name;
    if (name.toLowerCase().startsWith(lower) && lower.length >= 3) return name;
  }
  return null;
}

/* Generate a new architecture from a description (offline generate). */
export function generateFromDescription(text: string): Architecture {
  return detectArchitectureFromText(text);
}