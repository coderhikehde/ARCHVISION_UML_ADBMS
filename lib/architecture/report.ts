import type { Architecture, DiagramType } from "@/types/diagram";
import { validateArchitecture, type ExplainableValidation } from "@/lib/architecture/validate";
import { architectureStats } from "@/lib/architecture/model";

/**
 * Deterministic architecture report.
 *
 * The report is always built from the canonical model via
 * validateArchitecture() + architectureStats() — it never invents facts.
 * Optional AI narrative is appended as a labeled section by the caller
 * (lib/ai/describe.ts), never merged into the deterministic sections.
 */

export interface ReportNode {
  name: string;
  kind: string;
  stereotype: string | null;
  attributes: number;
  methods: number;
  notes: string[];
}

export interface ReportRelationship {
  source: string;
  target: string;
  type: string;
  label: string | null;
  sourceMultiplicity: string;
  targetMultiplicity: string;
}

export interface ReportStats {
  nodes: number;
  relationships: number;
  attributes: number;
  methods: number;
  byKind: Array<{ kind: string; count: number }>;
}

export interface ReportData {
  title: string;
  diagramType: DiagramType;
  nodes: ReportNode[];
  relationships: ReportRelationship[];
  stats: ReportStats;
  validation: ExplainableValidation;
}

export function buildReport(arch: Architecture): ReportData {
  const validation = validateArchitecture(arch);
  const base = architectureStats(arch);

  const byKind = new Map<string, number>();
  for (const node of arch.nodes) {
    byKind.set(node.kind, (byKind.get(node.kind) ?? 0) + 1);
  }

  return {
    title: arch.title,
    diagramType: arch.diagramType,
    nodes: arch.nodes.map((n) => ({
      name: n.name,
      kind: n.kind,
      stereotype: n.stereotype,
      attributes: n.attributes.length,
      methods: n.methods.length,
      notes: n.notes,
    })),
    relationships: arch.relationships.map((r) => ({
      source: r.source,
      target: r.target,
      type: r.type,
      label: r.label,
      sourceMultiplicity: r.sourceMultiplicity,
      targetMultiplicity: r.targetMultiplicity,
    })),
    stats: {
      nodes: base.nodes,
      relationships: base.relationships,
      attributes: arch.nodes.reduce((sum, n) => sum + n.attributes.length, 0),
      methods: arch.nodes.reduce((sum, n) => sum + n.methods.length, 0),
      byKind: Array.from(byKind.entries())
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => b.count - a.count),
    },
    validation,
  };
}

function relationshipSentence(rel: ReportRelationship): string {
  const verb: Record<string, string> = {
    inheritance: "inherits from",
    implementation: "implements",
    composition: "owns (composition)",
    aggregation: "aggregates",
    dependency: "depends on",
    call: "calls",
    reference: "references (foreign key)",
    transition: "transitions to",
    flow: "flows to",
    message: "sends message to",
    return: "returns to",
    async: "sends async message to",
    include: "includes",
    extend: "extends",
  };
  const parts = [rel.source, verb[rel.type] ?? "relates to", rel.target];
  const card = [rel.sourceMultiplicity, rel.targetMultiplicity].filter((m) => m && m !== "1");
  if (card.length > 0) parts.push(`(cardinality: ${card.join(" ⟷ ")})`);
  if (rel.label) parts.push(`— "${rel.label}"`);
  return parts.join(" ");
}

/** Full professional Markdown report: summary, inventory, relationships, findings, checks. */
export function reportToMarkdown(report: ReportData, narrative?: string): string {
  const { validation, stats, title, diagramType, nodes, relationships } = report;

  const lines: string[] = [];
  lines.push(`# ${title} — Architecture Report`);
  lines.push("");
  lines.push(`> **${diagramType} diagram** · **${stats.nodes}** nodes · **${stats.relationships}** relationships · **${stats.attributes}** attributes · **${stats.methods}** methods · **Quality score: ${validation.score}/100**`);
  lines.push("");

  lines.push("## Executive Summary");
  lines.push("");
  if (nodes.length === 0) {
    lines.push("_(Empty model — nothing to report yet.)_");
  } else {
    const kinds = stats.byKind.map((k) => `${k.count} ${k.kind}${k.count === 1 ? "" : "s"}`).join(", ");
    lines.push(`${title} is a ${diagramType} model composed of ${kinds}.`);
    const criticals = validation.issues.filter((i) => i.severity === "critical");
    if (criticals.length > 0) {
      lines.push(`It currently fails ${criticals.length} critical check${criticals.length === 1 ? "" : "s"} — resolving them is the top priority.`);
    } else if (validation.issues.length > 0) {
      lines.push("It is structurally sound, with minor findings to consider before it is production-ready.");
    } else {
      lines.push("It passes all checks — the model is internally consistent and ready.");
    }
  }
  lines.push("");

  if (narrative) {
    lines.push("## AI Overview");
    lines.push("");
    lines.push(narrative.trim());
    lines.push("");
  }

  lines.push("## Node Inventory");
  lines.push("");
  lines.push("| Node | Kind | Members | Stereotype | Notes |");
  lines.push("|------|------|---------|------------|-------|");
  for (const node of nodes) {
    const note = node.stereotype ? `«${node.stereotype}»` : node.notes[0] ?? "—";
    lines.push(`| ${node.name} | ${node.kind} | ${node.attributes + node.methods} | ${node.stereotype ?? "—"} | ${note} |`);
  }
  lines.push("");

  lines.push("## Relationships");
  lines.push("");
  if (relationships.length === 0) {
    lines.push("_(No relationships defined.)_");
  } else {
    for (const rel of relationships) {
      lines.push(`- ${relationshipSentence(rel)}`);
    }
  }
  lines.push("");

  lines.push("## Validation Findings");
  lines.push("");
  if (validation.issues.length === 0) {
    lines.push("No validation issues found — the model is internally consistent.");
  } else {
    const criticals = validation.issues.filter((i) => i.severity === "critical");
    const warnings = validation.issues.filter((i) => i.severity === "warning");
    const infos = validation.issues.filter((i) => i.severity === "info");
    if (criticals.length > 0) {
      lines.push("### 🔴 Critical");
      for (const issue of criticals) lines.push(`- ${issue.message}`);
      lines.push("");
    }
    if (warnings.length > 0) {
      lines.push("### 🟠 Warnings");
      for (const issue of warnings) lines.push(`- ${issue.message}`);
      lines.push("");
    }
    if (infos.length > 0) {
      lines.push("### 🔵 Info");
      for (const issue of infos) lines.push(`- ${issue.message}`);
      lines.push("");
    }
  }
  lines.push("");

  lines.push("## Checks Passed");
  lines.push("");
  if (validation.passed.length === 0) {
    lines.push("_(None — every check is failing.)_");
  } else {
    for (const rule of validation.passed) lines.push(`- ${rule}`);
  }
  lines.push("");

  if (validation.scoreBreakdown.length > 0) {
    lines.push("## Score Breakdown");
    lines.push("");
    lines.push("| Rule | Penalty |");
    lines.push("|------|---------|");
    for (const entry of validation.scoreBreakdown) {
      lines.push(`| ${entry.label} | -${entry.penalty} |`);
    }
    lines.push("");
  }

  lines.push("_Generated deterministically by ArchVision from the canonical model._");
  return lines.join("\n");
}

export function filenameForReport(title: string): string {
  const safe = title.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || "diagram"}-report.md`;
}