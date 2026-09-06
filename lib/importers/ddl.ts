import type { Architecture, ArchitectureNode, ArchitectureRelationship } from "@/types/diagram";
import { architectureToMermaid } from "@/lib/architecture/serialization";

/**
 * SQL DDL importer (Epic 4) — PostgreSQL/MySQL `CREATE TABLE` scripts to
 * an ER diagram. Pure module: DDL text in, Mermaid erDiagram out, built
 * through the canonical Architecture AST so output rides the existing
 * parser/validator/canvas pipeline.
 *
 * Supported: CREATE TABLE [IF NOT EXISTS], schema-qualified and quoted
 * identifiers, inline column constraints (PRIMARY KEY / NOT NULL / UNIQUE /
 * REFERENCES), table-level PRIMARY KEY(col…) / UNIQUE(col) / FOREIGN KEY
 * constraints, ALTER TABLE … ADD [CONSTRAINT] FOREIGN KEY, MySQL backtick +
 * ENGINE tails, `--` and block comments. Cardinality: FK side is many
 * (0..* — 1..* when NOT NULL), referenced side is exactly one.
 */

export class DdlImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DdlImportError";
  }
}

export interface DdlImportResult {
  erMermaid: string;
  stats: { tables: number; columns: number; foreignKeys: number };
  warnings: string[];
}

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  references: { table: string; column: string | null } | null;
}

interface TableDef {
  name: string;
  columns: ColumnDef[];
}

/* --------------------------- lexing --------------------------- */

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " ");
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (const char of sql) {
    if (char === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (char === "`" && !inSingle && !inDouble) inBacktick = !inBacktick;
    if (char === ";" && !inSingle && !inDouble && !inBacktick) {
      statements.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
}

/** Split a table body on commas that are not nested inside parentheses or quotes. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (const char of body) {
    if (char === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (char === "`" && !inSingle && !inDouble) inBacktick = !inBacktick;
    if (!inSingle && !inDouble && !inBacktick) {
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      else if (char === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function bareIdentifier(raw: string): string {
  return raw.replace(/[`"[\]]/g, "").trim();
}

function schemalessIdentifier(raw: string): string {
  const identifier = bareIdentifier(raw).split(".").pop() ?? raw;
  const clean = identifier.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
  return clean.length > 0 ? clean : "TABLE";
}

function baseType(rawType: string): string {
  // varchar(255) -> varchar; decimal(10,2) -> decimal; "timestamp with time zone" -> timestamp
  const first = rawType.trim().split(/\s+/)[0] ?? "text";
  return first.split("(")[0].replace(/[^A-Za-z0-9_]/g, "").toLowerCase() || "text";
}

const CONSTRAINT_KEYWORDS = /^(primary\s+key|unique|foreign\s+key|check\b|constraint\b|key\b|index\b|fulltext|spatial)/i;

/* --------------------------- parsing --------------------------- */

function parseCreateTable(statement: string): TableDef | null {
  const match = /^create\s+table\s+(?:if\s+not\s+exists\s+)?([\w`"[\].$ ]+?)\s*\(([\s\S]+)\)\s*[^)]*$/i.exec(
    statement.replace(/\s+/g, " ").trim()
  );
  if (!match) return null;
  const tableName = schemalessIdentifier(match[1]);
  const table: TableDef = { name: tableName, columns: [] };

  for (const item of splitTopLevel(match[2])) {
    const line = item.replace(/\s+/g, " ").trim();
    if (CONSTRAINT_KEYWORDS.test(line)) {
      applyTableConstraint(table, line);
      continue;
    }
    const column = parseColumn(line);
    if (column) table.columns.push(column);
  }
  return table.columns.length > 0 ? table : null;
}

function parseColumn(line: string): ColumnDef | null {
  const match = /^([`"[]?[\w$]+[`"\]]?)(?:\s*\.\s*[`"[]?[\w$]+[`"\]]?)?\s+([A-Za-z][\w ]*)/.exec(line);
  if (!match) return null;
  const name = schemalessIdentifier(match[1]);
  const rest = line.slice(match[1].length);
  const upper = rest.toUpperCase();
  return {
    name,
    type: baseType(match[2]),
    nullable: !/\bNOT\s+NULL\b/.test(upper),
    primaryKey: /\bPRIMARY\s+KEY\b/.test(upper),
    unique: /\bUNIQUE\b/.test(upper),
    references: extractInlineReference(rest),
  };
}

function extractInlineReference(rest: string): ColumnDef["references"] {
  const match = /\bREFERENCES\s+[`"[]?([A-Za-z_][\w$.]*)[`"\]]?\s*(?:\(\s*[`"[]?([\w$]+)[`"\]]?\s*\))?/i.exec(rest);
  if (!match) return null;
  return {
    table: schemalessIdentifier(match[1]),
    column: match[2] ? bareIdentifier(match[2]) : null,
  };
}

function applyTableConstraint(table: TableDef, line: string): void {
  let body = line;
  const named = /^constraint\s+[`"[]?[\w $]+?[`"\]]?\s+(.*)$/i.exec(line);
  if (named) body = named[1];

  const pk = /^primary\s+key\s*\(([^)]+)\)/i.exec(body);
  if (pk) {
    for (const col of pk[1].split(",")) {
      const target = findColumn(table, col);
      if (target) target.primaryKey = true;
    }
    return;
  }

  if (/^unique/i.test(body)) {
    // Forms: UNIQUE (col…), UNIQUE KEY name (col…), UNIQUE INDEX name (col…)
    const cols = /^(?:unique(?:\s+(?:key|index))?(?:\s+[`"[]?[\w$]+[`"\]]?)?)?\s*\(([^)]+)\)/i.exec(body);
    if (cols) {
      for (const col of cols[1].split(",")) {
        const target = findColumn(table, col);
        if (target) target.unique = true;
      }
    }
    return;
  }

  const fk = /^foreign\s+key\s*\(\s*[`"[]?([\w$]+)[`"\]]?\s*\)\s*references\s+[`"[]?([A-Za-z_][\w$.]*)[`"\]]?\s*(?:\(\s*[`"[]?([\w$]+)[`"\]]?\s*\))?/i.exec(body);
  if (fk) {
    const column = findColumn(table, fk[1]) ?? addHiddenColumn(table, schemalessIdentifier(fk[1]));
    column.references = {
      table: schemalessIdentifier(fk[2]),
      column: fk[3] ? bareIdentifier(fk[3]) : null,
    };
  }
}

function findColumn(table: TableDef, raw: string): ColumnDef | null {
  const name = schemalessIdentifier(raw);
  return table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
}

function addHiddenColumn(table: TableDef, name: string): ColumnDef {
  const existing = findColumn(table, name);
  if (existing) return existing;
  const column: ColumnDef = { name, type: "int", nullable: true, primaryKey: false, unique: false, references: null };
  table.columns.push(column);
  return column;
}

function parseAlterTable(statement: string): { table: string; constraint: string } | null {
  const flat = statement.replace(/\s+/g, " ").trim();
  if (!/^alter\s+table/i.test(flat) || !/\badd\b/i.test(flat)) return null;
  // Constraint body may or may not carry a name: ADD CONSTRAINT x FOREIGN KEY …
  const constraint = flat
    .replace(/^.*?\badd\s+/i, "")
    .replace(/^constraint\s+[`"[]?[\w$]+[`"\]]?\s+/i, "")
    .trim();
  if (!/^foreign/i.test(constraint)) return null;
  const tableMatch = /^alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?[`"[]?([A-Za-z_][\w$.]*)[`"\]]?\s+add/i.exec(flat);
  if (!tableMatch) return null;
  return { table: schemalessIdentifier(tableMatch[1]), constraint };
}

/* --------------------------- assembly --------------------------- */

function makeTableNode(table: TableDef): ArchitectureNode {
  return {
    id: table.name,
    name: table.name,
    kind: "table",
    stereotype: "table",
    parentId: null,
    attributes: table.columns.map((column) => ({
      name: column.name,
      type: column.type,
      visibility: "public" as const,
      isStatic: false,
      isDerived: false,
      isPrimaryKey: column.primaryKey,
      isForeignKey: column.references !== null,
      isUnique: column.unique,
      isNullable: column.nullable,
      defaultValue: null,
    })),
    methods: [],
    isAbstract: false,
    isInterface: false,
    notes: [],
  };
}

function makeFkRelationship(index: number, childTable: string, column: ColumnDef): ArchitectureRelationship {
  return {
    id: `ddl_fk_${index}`,
    source: column.references!.table,
    target: childTable,
    type: "reference",
    label: column.name,
    sourceMultiplicity: "1",
    targetMultiplicity: column.nullable ? "0..*" : "1..*",
    direction: "forward",
    action: column.name,
    foreignKeyColumn: column.name,
    description: null,
  };
}

export function importDdl(source: string): DdlImportResult {
  if (!source.trim()) throw new DdlImportError("Paste a SQL script containing CREATE TABLE statements.");
  const cleaned = stripComments(source);
  const statements = splitStatements(cleaned);

  const warnings: string[] = [];
  const tables = new Map<string, TableDef>();
  const pendingAlterFks: Array<{ table: string; constraint: string }> = [];

  for (const statement of statements) {
    if (/^create\s+table/i.test(statement)) {
      const table = parseCreateTable(statement);
      if (table) {
        if (tables.has(table.name)) {
          warnings.push(`Duplicate CREATE TABLE for "${table.name}" — kept the first definition.`);
        } else {
          tables.set(table.name, table);
        }
      }
    } else if (/^alter\s+table/i.test(statement)) {
      const alter = parseAlterTable(statement);
      if (alter) pendingAlterFks.push(alter);
    }
  }

  if (tables.size === 0) {
    throw new DdlImportError("No CREATE TABLE statements found in the script.");
  }

  // Apply ALTER TABLE FKs after all tables exist.
  for (const alter of pendingAlterFks) {
    const table = tables.get(alter.table);
    if (!table) {
      warnings.push(`ALTER TABLE "${alter.table}" skipped — that table is not defined in the script.`);
      continue;
    }
    applyTableConstraint(table, alter.constraint);
  }

  const arch: Architecture = { diagramType: "ER", title: "Imported Schema", nodes: [], relationships: [], notes: [], sourceText: null };
  let columnCount = 0;
  let fkCount = 0;
  for (const table of tables.values()) {
    arch.nodes.push(makeTableNode(table));
    columnCount += table.columns.length;
    for (const column of table.columns) {
      if (!column.references) continue;
      if (!tables.has(column.references.table)) {
        warnings.push(`Column "${table.name}.${column.name}" references missing table "${column.references.table}" — edge skipped.`);
        continue;
      }
      arch.relationships.push(makeFkRelationship(fkCount++, table.name, column));
    }
  }

  if (arch.nodes.length > 40) {
    warnings.push(`${arch.nodes.length} tables imported — the canvas may get crowded.`);
  }

  return {
    erMermaid: architectureToMermaid(arch),
    stats: { tables: arch.nodes.length, columns: columnCount, foreignKeys: fkCount },
    warnings,
  };
}
