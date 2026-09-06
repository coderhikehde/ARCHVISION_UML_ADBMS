import type { Architecture, ArchitectureNode, UMLModel } from "@/types/diagram";
import { validateArchitecture } from "@/lib/architecture/validate";
import { generateSummary } from "@/lib/architecture/docs";

/**
 * Shared AI description helper.
 *
 * One public entry point per context (architecture / model / node) that
 * first tries the online provider route (/api/ai/describe) and falls back
 * to a deterministic local description. The `mode` field is always
 * surfaced to the UI so the user can tell where the text came from —
 * "offline mode uses ArchVision's local extraction engine" is the
 * documented convention across the app.
 */

export type DescribeMode = "online" | "offline";

export interface DescribeResult {
  mode: DescribeMode;
  text: string;
}

interface CompactNode {
  name: string;
  kind: string;
  attributeCount: number;
  methodCount: number;
}

interface CompactRelationship {
  source: string;
  target: string;
  type: string;
  label: string | null;
}

interface CompactIssue {
  severity: string;
  message: string;
}

interface DescribePayload {
  title: string;
  diagramType: string;
  nodes: CompactNode[];
  relationships: CompactRelationship[];
  issues: CompactIssue[];
  focus?: string;
}

const ONLINE_TIMEOUT_MS = 9000;

function compactArchitecture(arch: Architecture): DescribePayload {
  const validation = validateArchitecture(arch);
  return {
    title: arch.title,
    diagramType: arch.diagramType,
    nodes: arch.nodes.map((n) => ({
      name: n.name,
      kind: n.kind,
      attributeCount: n.attributes.length,
      methodCount: n.methods.length,
    })),
    relationships: arch.relationships.map((r) => ({
      source: r.source,
      target: r.target,
      type: r.type,
      label: r.label,
    })),
    issues: validation.issues.map((i) => ({ severity: i.severity, message: i.message })),
  };
}

function compactModel(model: UMLModel): DescribePayload {
  return {
    title: model.title,
    diagramType: model.diagramType,
    nodes: model.classes.map((c) => ({
      name: c.name,
      kind: c.stereotype ?? "class",
      attributeCount: c.attributes.length,
      methodCount: c.methods.length,
    })),
    relationships: model.links.map((l) => ({
      source: l.from,
      target: l.to,
      type: l.type,
      label: l.label,
    })),
    issues: [],
  };
}

async function tryOnline(payload: DescribePayload): Promise<DescribeResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS);
    const response = await fetch("/api/ai/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { text?: string; data?: { text?: string } };
    const text = data.data?.text ?? data.text;
    if (!text || text.trim().length === 0) return null;
    return { mode: "online", text: text.trim() };
  } catch {
    return null;
  }
}

function describeFromPayloadLocal(payload: DescribePayload): string {
  const lines: string[] = [];
  if (payload.nodes.length === 0) {
    lines.push("This is an empty model — no nodes have been defined yet. Add classes, entities or actors to begin building the architecture.");
    return lines.join(" ");
  }

  lines.push(
    `${payload.title} is a ${payload.diagramType} model with ${payload.nodes.length} node${payload.nodes.length === 1 ? "" : "s"} connected by ${payload.relationships.length} relationship${payload.relationships.length === 1 ? "" : "s"}.`
  );

  const byKind = new Map<string, number>();
  for (const node of payload.nodes) {
    byKind.set(node.kind, (byKind.get(node.kind) ?? 0) + 1);
  }
  const kinds = Array.from(byKind.entries())
    .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`)
    .join(", ");
  if (kinds) lines.push(`The structure centers on ${kinds}.`);

  if (payload.relationships.length > 0) {
    const top = payload.relationships.slice(0, 5);
    lines.push(
      `Key flows: ${top.map((r) => `${r.source} → ${r.target} (${r.type}${r.label ? `, "${r.label}"` : ""})`).join("; ")}${payload.relationships.length > 5 ? `, and ${payload.relationships.length - 5} more` : ""}.`
    );
  }

  const criticals = payload.issues.filter((i) => i.severity === "critical");
  const warnings = payload.issues.filter((i) => i.severity === "warning");
  if (criticals.length > 0) {
    lines.push(`**Needs attention:** ${criticals[0].message}`);
    if (criticals.length > 1) lines.push(`There ${criticals.length === 2 ? "is" : "are"} also ${criticals.length - 1} more critical finding${criticals.length === 2 ? "" : "s"}.`);
  } else if (warnings.length > 0) {
    lines.push(`**Heads-up:** ${warnings[0].message}`);
  } else {
    lines.push("No validation issues detected — the model is internally consistent.");
  }

  return lines.join(" ");
}

/* ---------------- public entry points ---------------- */

export async function describeArchitecture(arch: Architecture): Promise<DescribeResult> {
  const payload = compactArchitecture(arch);
  const online = await tryOnline(payload);
  if (online) return online;
  return { mode: "offline", text: describeFromPayloadLocal(payload) };
}

export async function describeNode(node: ArchitectureNode, arch: Architecture): Promise<DescribeResult> {
  const payload = compactArchitecture(arch);
  payload.focus = node.name;
  const online = await tryOnline(payload);
  if (online) return online;
  return { mode: "offline", text: describeNodeLocal(node, arch) };
}

export async function describeModel(model: UMLModel): Promise<DescribeResult> {
  const payload = compactModel(model);
  const online = await tryOnline(payload);
  if (online) return online;
  return { mode: "offline", text: describeFromPayloadLocal(payload) };
}

/* ---------------- local (deterministic) node description ---------------- */

function roleForKind(kind: string): string {
  switch (kind) {
    case "controller":
      return "HTTP boundary that routes requests into services";
    case "service":
      return "business-logic layer orchestrating domain rules";
    case "repository":
      return "data-access abstraction isolating persistence from services";
    case "database":
      return "persistence store";
    case "table":
      return "relational table (ER) entity";
    case "entity":
      return "domain entity";
    case "interface":
      return "contract consumed by other nodes";
    case "actor":
      return "external participant in the interaction";
    case "abstract":
      return "abstract base class";
    case "api":
      return "API surface";
    default:
      return "structural unit of the model";
  }
}

export function describeNodeLocal(node: ArchitectureNode, arch: Architecture): string {
  const incoming = arch.relationships.filter((r) => r.target === node.name);
  const outgoing = arch.relationships.filter((r) => r.source === node.name);
  const parts = [
    `${node.name} plays the role of ${roleForKind(node.kind)}.`,
  ];
  if (node.attributes.length > 0) {
    parts.push(`It declares ${node.attributes.length} attribute${node.attributes.length === 1 ? "" : "s"} (${node.attributes.slice(0, 6).map((a) => a.name).join(", ")}${node.attributes.length > 6 ? ", …" : ""}).`);
  }
  if (node.methods.length > 0) {
    parts.push(`It exposes ${node.methods.length} method${node.methods.length === 1 ? "" : "s"} (${node.methods.slice(0, 6).map((m) => m.name).join(", ")}${node.methods.length > 6 ? ", …" : ""}).`);
  }
  if (outgoing.length > 0) {
    parts.push(`Depends on: ${outgoing.map((r) => `${r.target} (${r.type})`).join(", ")}.`);
  }
  if (incoming.length > 0) {
    parts.push(`Depended on by: ${incoming.map((r) => `${r.source} (${r.type})`).join(", ")}.`);
  }
  if (parts.length === 1) {
    parts.push("It has no members or relationships yet.");
  }
  return parts.join(" ");
}

/** Synchronous local summary for diagram-level contexts (no network). */
export function describeArchitectureLocal(arch: Architecture): string {
  return generateSummary(arch);
}