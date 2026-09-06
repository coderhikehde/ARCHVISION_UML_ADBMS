import type { Architecture, ArchitectureRelationshipType } from "@/types/diagram";
import { modelToMermaid, relationToMermaid } from "@/lib/mermaid/parser";
import { architectureToLegacy, multiplicityToCrowfoot } from "@/lib/architecture/model";

function mermaidName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

/* ------------------------------------------------------------------ */
/* architectureToMermaid — canonical model -> Mermaid source, by       */
/* diagram type (CLASS/ER/SEQUENCE). Keeps the model as a single       */
/* source of truth: everything exported (.md, PNG, code, diagrams) is  */
/* derived from the canonical model, never from stale caches.          */
/* ------------------------------------------------------------------ */

/** Legacy UMLModel projection for canvas rendering (class diagrams). */
export function architectureToLegacyForCanvas(arch: Architecture): ReturnType<typeof architectureToLegacy> {
  return architectureToLegacy(arch);
}

export function architectureToMermaid(arch: Architecture): string {
  switch (arch.diagramType) {
    case "ER":
      return toER(arch);
    case "SEQUENCE":
      return toSequence(arch);
    default:
      return modelToMermaid(architectureToLegacy(arch));
  }
}

export function toER(arch: Architecture): string {
  const lines: string[] = ["erDiagram", ""];
  const tables = arch.nodes.filter((n) => n.kind === "table" || n.stereotype === "table");
  for (const table of tables) {
    lines.push(`    ${table.name} {`);
    for (const attr of table.attributes) {
      const markers = [
        attr.isPrimaryKey ? "PK" : null,
        attr.isForeignKey ? "FK" : null,
        attr.isUnique ? "UK" : null,
      ].filter(Boolean) as string[];
      const suffix = markers.length > 0 ? ` ${markers.join(" ")}` : "";
      // Official Mermaid ER attribute grammar is "<type> <name> [PK|FK|UK]"
      // — writing "<name> <type>" made every text round-trip swap them.
      lines.push(`        ${attr.type} ${attr.name}${suffix}`);
    }
    lines.push("    }");
    lines.push("");
  }
  for (const rel of arch.relationships) {
    const left = multiplicityToCrowfoot(rel.sourceMultiplicity);
    const right = multiplicityToCrowfoot(rel.targetMultiplicity);
    lines.push(`    ${mermaidName(rel.source)} ${left}--${right} ${mermaidName(rel.target)}${rel.label ? ` : ${rel.label}` : ""}`);
  }
  return lines.join("\n");
}

export function toSequence(arch: Architecture): string {
  const lines: string[] = ["sequenceDiagram", "    autonumber"];
  const ordered = arch.nodes.filter((n) => n.kind === "actor").map((n) => n.name)
    .concat(arch.nodes.filter((n) => n.kind !== "actor").map((n) => n.name));
  const used = new Set<string>();
  for (const name of ordered) {
    if (used.has(name)) continue;
    used.add(name);
    lines.push(`    participant ${mermaidName(name)}`);
  }
  for (const rel of arch.relationships) {
    const arrow = rel.type === "return" ? "-->>" : "->>";
    lines.push(`    ${mermaidName(rel.source)}${arrow}${mermaidName(rel.target)}: ${rel.label ?? rel.type}`);
  }
  return lines.join("\n");
}

export function relationshipToMermaidOp(type: ArchitectureRelationshipType): string {
  switch (type) {
    case "inheritance":
      return relationToMermaid("inheritance");
    case "implementation":
      return relationToMermaid("implementation");
    case "composition":
      return relationToMermaid("composition");
    case "aggregation":
      return relationToMermaid("aggregation");
    case "dependency":
    case "call":
      return relationToMermaid("dependency");
    default:
      return relationToMermaid("association");
  }
}

/* ER crow's foot for sequence-style calls is irrelevant; kept for API parity. */
export function sequenceParticipants(arch: Architecture): string[] {
  return arch.nodes.map((n) => mermaidName(n.name));
}