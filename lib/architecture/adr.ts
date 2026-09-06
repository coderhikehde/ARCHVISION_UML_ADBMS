/**
 * Architecture Decision Records (Epic 6) — Nygard-format markdown.
 *
 * Pure domain module: no React, no storage. An ADR is authored as the
 * canonical five sections (Title/Status/Context/Decision/Consequences)
 * plus an optional "Linked Nodes" appendix that binds the record to
 * architecture nodes by name. Serialization and parsing round-trip.
 */

export const ADR_STATUSES = ["proposed", "accepted", "deprecated", "superseded"] as const;
export type AdrStatus = (typeof ADR_STATUSES)[number];

export interface AdrRecord {  id: string;
  /** Numbering is display-order only; supersession chains stay manual. */
  number: number;
  title: string;
  status: AdrStatus;
  context: string;
  decision: string;
  consequences: string;
  date: string; // ISO
  /** Names of architecture nodes this decision applies to. */
  linkedNodes: string[];
}

function titleToSlugNumber(titleLine: string): { number: number; title: string } | null {
  const match = /^#\s*(\d+)\.\s*(.+)$/.exec(titleLine.trim());
  if (!match) return null;
  return { number: Number(match[1]), title: match[2].trim() };
}

/** Serialize one ADR to Nygard-style markdown (stable, diff-friendly). */
export function adrToMarkdown(adr: AdrRecord): string {
  const lines: string[] = [
    `# ${adr.number}. ${adr.title}`,
    "",
    `Date: ${adr.date.slice(0, 10)}`,
    "",
    "## Status",
    "",
    statusLabel(adr.status),
    "",
    "## Context",
    "",
    adr.context.trim() || "(none)",
    "",
    "## Decision",
    "",
    adr.decision.trim() || "(none)",
    "",
    "## Consequences",
    "",
    adr.consequences.trim() || "(none)",
  ];
  if (adr.linkedNodes.length > 0) {
    lines.push("", "## Linked Nodes", "", ...adr.linkedNodes.map((n) => `- ${n}`));
  }
  return lines.join("\n") + "\n";
}

export function statusLabel(status: AdrStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusFromLabel(label: string): AdrStatus {
  const normalized = label.trim().toLowerCase();
  return (ADR_STATUSES as readonly string[]).includes(normalized) ? (normalized as AdrStatus) : "proposed";
}

/** Parse markdown into an ADR. Foreign/loose files degrade gracefully: any missing section becomes empty, unknown sections are ignored. */
export function adrFromMarkdown(markdown: string, fallbackId: string): AdrRecord | null {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const titleMatch = /^#\s*.+$/m.exec(normalized);
  if (!titleMatch) return null;
  const heading = titleToSlugNumber(titleMatch[0]);
  const title = heading?.title ?? titleMatch[0].replace(/^#\s*/, "").trim();
  const number = heading?.number ?? 1;

  // Split body into ## sections; a section ends where the NEXT header starts.
  const sections = new Map<string, string>();
  const sectionPattern = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const starts: Array<{ name: string; headerIndex: number; contentStart: number }> = [];
  while ((match = sectionPattern.exec(normalized)) !== null) {
    starts.push({
      name: match[1].trim().toLowerCase(),
      headerIndex: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].headerIndex : normalized.length;
    sections.set(starts[i].name, normalized.slice(starts[i].contentStart, end).trim());
  }

  const dateMatch = /\bDate:\s*(\d{4}-\d{2}-\d{2})/.exec(normalized);
  const linkedRaw = sections.get("linked nodes") ?? "";
  const linkedNodes = linkedRaw
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return {
    id: fallbackId,
    number,
    title,
    status: statusFromLabel(firstParagraph(sections.get("status")) || ""),
    context: sections.get("context") ?? "",
    decision: sections.get("decision") ?? "",
    consequences: sections.get("consequences") ?? "",
    date: dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : new Date().toISOString(),
    linkedNodes,
  };
}

function firstParagraph(section: string | undefined): string {
  if (!section) return "";
  return section.split(/\n\s*\n/)[0]?.trim() ?? "";
}

/** Bundle export: every ADR, separated by horizontal rules. */
export function adrsToMarkdownBundle(adrs: AdrRecord[]): string {
  const sorted = [...adrs].sort((a, b) => a.number - b.number);
  return sorted.map(adrToMarkdown).join("\n---\n\n");
}
