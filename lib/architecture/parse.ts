import type {
  Architecture,
  ArchitectureNode,
  ArchitectureRelationship,
  DiagramType,
} from "@/types/diagram";
import { detectDiagramType, parseMermaidClassDiagram } from "@/lib/mermaid/parser";
import { legacyToArchitecture } from "@/lib/architecture/model";

/* ------------------------------------------------------------------ */
/* parseArchitectureDiagram — canonical parse dispatch by diagram      */
/* type. CLASS uses the legacy parser; ER and SEQUENCE get dedicated  */
/* semantic parsers so tables/columns/participants/relations survive. */
/* ------------------------------------------------------------------ */

export interface ArchitectureParseResult {
  architecture: Architecture;
  error: string | null;
}

export function parseArchitectureDiagram(code: string): ArchitectureParseResult {
  const diagramType = detectDiagramType(code);
  if (!code.trim()) {
    return {
      architecture: createEmptyArchitecture(diagramType),
      error: null,
    };
  }
  try {
    let architecture: Architecture;
    switch (diagramType) {
      case "ER":
        architecture = parseERDiagram(code);
        break;
      case "SEQUENCE":
        architecture = parseSequenceDiagram(code);
        break;
      default:
        architecture = legacyToArchitecture(parseMermaidClassDiagram(code));
    }
    architecture.sourceText = code;
    return { architecture, error: null };
  } catch (error) {
    return {
      architecture: createEmptyArchitecture(diagramType),
      error: error instanceof Error ? error.message : "Failed to parse diagram",
    };
  }
}

function createEmptyArchitecture(diagramType: DiagramType): Architecture {
  return { diagramType, title: "Untitled", nodes: [], relationships: [], notes: [], sourceText: null };
}

/* ---------------- ER diagram parser ---------------- */

export interface ERColumnSemantics {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isNullable: boolean;
}

export function parseERColumns(line: string): ERColumnSemantics[] {
  const parts = line.split(/,\s*/).filter(Boolean);
  const columns: ERColumnSemantics[] = [];
  for (const raw of parts) {
    const tokens = raw.trim().split(/\s+/);
    let isPrimaryKey = false;
    let isForeignKey = false;
    let isUnique = false;
    const rest: string[] = [];
    for (const token of tokens) {
      const upper = token.toUpperCase();
      if (upper === "PK") isPrimaryKey = true;
      else if (upper === "FK") isForeignKey = true;
      else if (upper === "UK" || upper === "UQ") isUnique = true;
      else rest.push(token);
    }
    // Mermaid ER entity syntax: <type> <name> [PK|FK|UK]
    const name = rest[1] ?? rest[0] ?? "";
    const type = rest.length > 1 ? rest[0] : "unknown";
    columns.push({ name, type, isPrimaryKey, isForeignKey, isUnique, isNullable: !isPrimaryKey });
  }
  return columns;
}

function ensureTable(nodes: Map<string, ArchitectureNode>, name: string, implicit = false): ArchitectureNode {
  const existing = nodes.get(name);
  if (existing) return existing;
  const node: ArchitectureNode = {
    id: name,
    name,
    kind: "table",
    stereotype: "table",
    parentId: null,
    attributes: [],
    methods: [],
    isAbstract: false,
    isInterface: false,
    notes: [],
    implicit,
  };
  nodes.set(name, node);
  return node;
}

/* Mermaid ER relation grammar (crowfoot notation):
 *   USER ||--o{ MESSAGE : sends
 *   ORDER ||--|{ LINE_ITEM : contains
 *   CUSTOMER |o--o{ ORDER : places
 *
 * Left end cardinality describes the SOURCE node, right end the TARGET.
 * Symbol meaning:
 *   ||  exactly one (1)         o| or |o → zero or one (0..1)
 *   }|  one or more (1..*)     }o / o} → zero or more (0..*)
 *   |{  exactly one (left)     o{      → zero or more (left)
 */

const ER_RELATION_PATTERN =
  /^([A-Za-z_][A-Za-z0-9_]*)\s+((?:[|o{}]){1,3})?--((?:[|o{}]){1,3})?\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*(.*))?$/;

function crowfootToMultiplicity(symbol: string): string {
  const s = symbol.replace(/[^o|{}]/g, "");
  const hasZero = s.includes("o");
  const hasMany = s.includes("{") || s.includes("}");
  const hasOne = s.includes("|");
  if (hasMany && hasZero) return "0..*";
  if (hasMany) return "1..*";
  if (hasZero && hasOne) return "0..1";
  if (hasOne) return "1";
  if (hasZero) return "0..1";
  return "1";
}

export function parseERDiagram(code: string): Architecture {
  const nodes = new Map<string, ArchitectureNode>();
  const relationships: ArchitectureRelationship[] = [];
  const lines = code.split(/\r?\n/);
  let currentTable: ArchitectureNode | null = null;

  for (const rawLine of lines) {
    const line = rawLine.split("%%")[0].trim();
    if (!line) continue;
    if (/^erDiagram/i.test(line) || /^direction/i.test(line)) continue;

    if (line === "}") {
      currentTable = null;
      continue;
    }

    if (currentTable) {
      for (const column of parseERColumns(line)) {
        if (!currentTable.attributes.some((a) => a.name === column.name)) {
          currentTable.attributes.push({
            name: column.name,
            type: column.type,
            visibility: "public",
            isStatic: false,
            isDerived: false,
            isPrimaryKey: column.isPrimaryKey,
            isForeignKey: column.isForeignKey,
            isUnique: column.isUnique,
            isNullable: column.isNullable,
            defaultValue: null,
          });
        }
      }
      continue;
    }

    const tableHeader = /^([A-Za-z_][A-Za-z0-9_]*)\s*\{$/.exec(line);
    if (tableHeader) {
      currentTable = ensureTable(nodes, tableHeader[1]);
      continue;
    }

    const rel = parseERRelation(line, relationships.length);
    if (rel && rel.source !== rel.target) {
      ensureTable(nodes, rel.source, true);
      ensureTable(nodes, rel.target, true);
      relationships.push(rel);
    }
  }

  /* Decorate the FK holder table (the many-side of the relation) with
   * a foreign-key column named `<referenced_table>_id`. */
  for (const rel of relationships) {
    const manySide = rel.targetMultiplicity === "0..*" || rel.targetMultiplicity === "1..*" || rel.targetMultiplicity === "*";
    const holderName = manySide ? rel.target : rel.source;
    const refName = manySide ? rel.source : rel.target;
    const holder = nodes.get(holderName);
    const ref = nodes.get(refName);
    if (!holder || !ref) continue;
    const refPk = ref.attributes.find((a) => a.isPrimaryKey);
    const columnName = refPk ? refPk.name : `${refName.toLowerCase()}_id`;
    rel.foreignKeyColumn = columnName;
    const existing = holder.attributes.find((a) => a.name === columnName);
    if (existing) {
      existing.isForeignKey = true;
    } else {
      holder.attributes.push({
        name: columnName,
        type: refPk?.type ?? "string",
        visibility: "public",
        isStatic: false,
        isDerived: false,
        isPrimaryKey: false,
        isForeignKey: true,
        isUnique: false,
        isNullable: !(rel.sourceMultiplicity === "1" && rel.targetMultiplicity === "1"),
        defaultValue: null,
      });
    }
  }

  return {
    diagramType: "ER",
    title: "ER Diagram",
    nodes: Array.from(nodes.values()),
    relationships,
    notes: [],
    sourceText: code,
  };
}

function parseERRelation(line: string, index: number): ArchitectureRelationship | null {
  const cleaned = line.replace(/^erDiagram\s*/i, "");
  const match = ER_RELATION_PATTERN.exec(cleaned);
  if (!match) return null;
  const [, source, leftRaw, rightRaw, targetToken, labelRaw] = match;
  const target = targetToken ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(source) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) return null;
  const label = labelRaw ? labelRaw.trim().replace(/^"|"$/g, "") : null;
  return {
    id: `er_rel_${index}`,
    source,
    target,
    type: "reference",
    label,
    sourceMultiplicity: leftRaw ? crowfootToMultiplicity(leftRaw) : "1",
    targetMultiplicity: rightRaw ? crowfootToMultiplicity(rightRaw) : "1",
    direction: "forward",
    action: label,
    foreignKeyColumn: null,
    description: null,
  };
}

/* ------------------------------------------------------------------ */
/* SEQUENCE diagram parser                                             */
/* ------------------------------------------------------------------ */

export function parseSequenceDiagram(text: string): Architecture {
  const nodes = new Map<string, ArchitectureNode>();
  const relationships: ArchitectureRelationship[] = [];
  const lines = text.split(/\r?\n/);
  let sequenceStarted = false;

  const SETTING_KW = /^(activate|deactivate|autonumber|note|title|loop|alt|else|opt|par|end|box)/i;

  const ensureParticipant = (name: string): ArchitectureNode => {
    const existing = nodes.get(name);
    if (existing) return existing;
    const kind: ArchitectureNode["kind"] = /client|user|actor/i.test(name)
      ? "actor"
      : /controller/i.test(name)
        ? "controller"
        : /service/i.test(name)
          ? "service"
          : /repo/i.test(name)
            ? "repository"
            : /database|db/i.test(name)
              ? "database"
              : "class";
    const participant: ArchitectureNode = {
      id: name,
      name,
      kind,
      stereotype: null,
      parentId: null,
      attributes: [],
      methods: [],
      isAbstract: false,
      isInterface: false,
      notes: [],
    };
    nodes.set(name, participant);
    return participant;
  };

  for (const rawLine of lines) {
    const line = rawLine.split("%%")[0].trim();
    if (!line) continue;
    if (/^sequenceDiagram/i.test(line)) {
      sequenceStarted = true;
      continue;
    }
    if (!sequenceStarted) continue;
    if (SETTING_KW.test(line)) continue;

    const declarator = /^(?:participant|actor)\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*)/i.exec(line);
    if (declarator) {
      ensureParticipant(declarator[1]);
      continue;
    }

    const message =
      /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|>|>>|->>|-->>|->|-->|-x|--x|--|-\{*)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*(.*))?$/.exec(
        line
      );
    if (message) {
      const from = message[1];
      const to = message[2] ?? "";
      const label = message[3]?.trim() ?? null;
      ensureParticipant(from);
      ensureParticipant(to);
      const isReturn = /-->>|--x/.test(line.split(":")[0]);
      relationships.push({
        id: `seq_rel_${relationships.length}`,
        source: from,
        target: to,
        type: isReturn ? "return" : "call",
        label,
        sourceMultiplicity: "1",
        targetMultiplicity: "1",
        direction: "forward",
        action: label,
        foreignKeyColumn: null,
        description: null,
      });
    }
  }

  return {
    diagramType: "SEQUENCE",
    title: "Sequence Diagram",
    nodes: Array.from(nodes.values()),
    relationships,
    notes: [],
    sourceText: text,
  };
}