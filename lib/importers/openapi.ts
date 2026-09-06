import { load as loadYaml } from "js-yaml";
import type { Architecture, ArchitectureNode, ArchitectureRelationship } from "@/types/diagram";
import { architectureToMermaid } from "@/lib/architecture/serialization";

/**
 * OpenAPI 3.0/3.1 (and Swagger 2.0 `definitions`) importer — Epic 4.
 *
 * Pure module: spec in (object | JSON string | YAML string), Mermaid out.
 * Output rides the canonical Architecture AST and the existing serializer,
 * so generated diagrams are guaranteed to round-trip through the same
 * parser/validator/canvas pipeline as hand-written ones.
 *
 * Mapping:
 *   - tag / first path segment -> an API group: a C4 namespace containing
 *     one `<Group>API` class whose methods are the operations
 *   - components.schemas -> model classes (properties as attributes)
 *   - requestBody $ref      -> dependency edge  (group ..> schema)
 *   - success response $ref -> association edge (group --> schema)
 *   - schema allOf          -> inheritance edge
 */

export interface OpenApiImportResult {
  /** Component flowchart (class diagram) source. */
  classMermaid: string;
  /** Request flow (sequence diagram) source. */
  sequenceMermaid: string;
  stats: { operations: number; schemas: number; groups: number };
  warnings: string[];
}

export class OpenApiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenApiImportError";
  }
}

/* ----------------------------- limits ----------------------------- */

const MAX_OPERATIONS = 120;
const MAX_SCHEMAS = 60;
const MAX_ATTRIBUTES_PER_SCHEMA = 15;
const MAX_SEQUENCE_MESSAGES = 100;

/* --------------------------- spec parsing --------------------------- */

function parseSpec(source: string | unknown): Record<string, unknown> {
  let doc: unknown = source;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) throw new OpenApiImportError("The specification is empty — paste an OpenAPI JSON or YAML document.");
    try {
      doc = JSON.parse(trimmed);
    } catch {
      try {
        doc = loadYaml(trimmed) as unknown;
      } catch {
        throw new OpenApiImportError("Could not parse the specification as JSON or YAML.");
      }
    }
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new OpenApiImportError("The specification must be a JSON/YAML object.");
  }
  const record = doc as Record<string, unknown>;
  const hasPaths = typeof record.paths === "object" && record.paths !== null;
  const hasVersion = typeof record.openapi === "string" || typeof record.swagger === "string";
  if (!hasPaths && !hasVersion) {
    throw new OpenApiImportError('This does not look like an OpenAPI document (missing "paths" / "openapi").');
  }
  return record;
}

function resolveRef(ref: unknown, schemas: Map<string, SchemaEntry>): string | null {
  if (typeof ref !== "string") return null;
  const name = decodeURIComponent(ref.split("/").pop() ?? "");
  return schemas.has(name) ? name : null;
}

interface SchemaEntry {
  name: string;
  properties: Array<{ name: string; type: string; required: boolean }>;
  extends: string | null;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

interface Operation {
  groupKey: string;
  groupLabel: string;
  method: string;
  path: string;
  requestSchema: string | null;
  responseSchema: string | null;
}

function pathParamNames(path: string): string[] {
  return Array.from(path.matchAll(/\{([^}]+)\}/g)).map((m) => sanitizeIdentifier(m[1]));
}

function collectOperations(paths: Record<string, unknown>, schemas: Map<string, SchemaEntry>, warnings: string[]): Operation[] {
  const operations: Operation[] = [];
  for (const [path, pathItem] of Object.entries(paths)) {
    if (typeof pathItem !== "object" || pathItem === null) continue;
    for (const [method, op] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (operations.length >= MAX_OPERATIONS) {
        warnings.push(`Truncated at ${MAX_OPERATIONS} operations — the rest were skipped.`);
        return operations;
      }
      const record = (typeof op === "object" && op !== null ? op : {}) as Record<string, unknown>;
      const tags = Array.isArray(record.tags) ? record.tags.filter((t): t is string => typeof t === "string") : [];
      const segment = path.split("/").filter(Boolean)[0] ?? "api";
      const rawGroup = tags[0] ?? segment;
      const groupLabel = rawGroup.replace(/[{}]/g, "").trim() || "api";
      operations.push({
        groupKey: sanitizeIdentifier(groupLabel),
        groupLabel,
        method: method.toUpperCase(),
        path,
        requestSchema: extractBodySchemaRef(record.requestBody, schemas),
        responseSchema: extractSuccessResponseRef(record.responses, schemas),
      });
    }
  }
  return operations;
}

function unwrapLike(value: unknown, schemas: Map<string, SchemaEntry>): string | null {
  // Follow {$ref}, arrays of refs, and oneOf/anyOf first entries.
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const direct = resolveRef(record.$ref, schemas);
  if (direct) return direct;
  if (Array.isArray(record.oneOf) || Array.isArray(record.anyOf)) {
    const list = (record.oneOf ?? record.anyOf) as unknown[];
    for (const item of list) {
      const hit = unwrapLike(item, schemas);
      if (hit) return hit;
    }
  }
  if (typeof record.items === "object" && record.items !== null) return unwrapLike(record.items, schemas);
  return null;
}

function extractBodySchemaRef(requestBody: unknown, schemas: Map<string, SchemaEntry>): string | null {
  if (typeof requestBody !== "object" || requestBody === null) return null;
  const content = (requestBody as Record<string, unknown>).content;
  if (typeof content !== "object" || content === null) return null;
  const json = (content as Record<string, unknown>)["application/json"];
  if (typeof json !== "object" || json === null) return null;
  return unwrapLike((json as Record<string, unknown>).schema, schemas);
}

function extractSuccessResponseRef(responses: unknown, schemas: Map<string, SchemaEntry>): string | null {
  if (typeof responses !== "object" || responses === null) return null;
  const record = responses as Record<string, unknown>;
  const preferred = record["200"] ?? record["201"] ?? record.default;
  if (typeof preferred !== "object" || preferred === null) return null;
  const content = (preferred as Record<string, unknown>).content;
  if (typeof content !== "object" || content === null) return null;
  const json = (content as Record<string, unknown>)["application/json"];
  if (typeof json !== "object" || json === null) return null;
  return unwrapLike((json as Record<string, unknown>).schema, schemas);
}

function collectSchemas(spec: Record<string, unknown>): Map<string, SchemaEntry> {
  const components = spec.components as Record<string, unknown> | undefined;
  const raw =
    (typeof components === "object" && components !== null
      ? (components.schemas as Record<string, unknown> | undefined)
      : undefined) ??
    ((spec.definitions ?? {}) as Record<string, unknown>);
  const schemas = new Map<string, SchemaEntry>();
  if (typeof raw !== "object" || raw === null) return schemas;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (schemas.size >= MAX_SCHEMAS) break;
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const required = new Set(
      Array.isArray(record.required) ? record.required.filter((r): r is string => typeof r === "string") : []
    );
    const properties: SchemaEntry["properties"] = [];
    const props = record.properties;
    if (typeof props === "object" && props !== null) {
      for (const [propName, propValue] of Object.entries(props as Record<string, unknown>)) {
        if (properties.length >= MAX_ATTRIBUTES_PER_SCHEMA) break;
        const propRecord = (typeof propValue === "object" && propValue !== null ? propValue : {}) as Record<string, unknown>;
        const type = typeof propRecord.type === "string" ? propRecord.type : "ref";
        properties.push({ name: propName, type, required: required.has(propName) });
      }
    }
    let extends_: string | null = null;
    if (Array.isArray(record.allOf)) {
      for (const part of record.allOf as unknown[]) {
        if (typeof part === "object" && part !== null && typeof (part as Record<string, unknown>).$ref === "string") {
          extends_ = String((part as Record<string, unknown>).$ref).split("/").pop() ?? null;
          break;
        }
      }
    }
    schemas.set(name, { name, properties, extends: extends_ });
  }
  return schemas;
}

/* --------------------------- identifiers --------------------------- */

export function sanitizeIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "").replace(/^([0-9])/, "_$1");
  return cleaned.length > 0 ? cleaned : "X";
}

function toPascal(raw: string): string {
  return sanitizeIdentifier(raw)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

/* ------------------------- class diagram ------------------------- */

function emptyArchitecture(title: string): Architecture {
  return { diagramType: "CLASS", title, nodes: [], relationships: [], notes: [], sourceText: null };
}

function makeNode(name: string, kind: ArchitectureNode["kind"], stereotype: string | null, parentId: string | null, attributes: ArchitectureNode["attributes"] = []): ArchitectureNode {
  return {
    id: name,
    name,
    kind,
    stereotype,
    parentId,
    attributes,
    methods: [],
    isAbstract: false,
    isInterface: false,
    notes: [],
  };
}

function makeRelationship(id: string, source: string, target: string, type: ArchitectureRelationship["type"], label: string): ArchitectureRelationship {
  return {
    id,
    source,
    target,
    type,
    label,
    sourceMultiplicity: "",
    targetMultiplicity: "",
    direction: "forward",
    action: null,
    foreignKeyColumn: null,
  };
}

function buildClassDiagram(operations: Operation[], schemas: Map<string, SchemaEntry>, title: string, warnings: string[]): string {
  const arch = emptyArchitecture(title);
  const usedIds = new Set<string>();
  const unique = (base: string): string => {
    let candidate = base;
    let i = 2;
    while (usedIds.has(candidate)) candidate = `${base}_${i++}`;
    usedIds.add(candidate);
    return candidate;
  };

  // Model classes from component schemas.
  for (const schema of schemas.values()) {
    const id = unique(sanitizeIdentifier(schema.name));
    const attributes = schema.properties.map((p) => ({
      name: p.required ? p.name : `${p.name}?`,
      type: p.type,
      visibility: "public" as const,
      isStatic: false,
      isDerived: false,
      isPrimaryKey: false,
      isForeignKey: false,
      isUnique: false,
      isNullable: !p.required,
      defaultValue: null,
    }));
    arch.nodes.push(makeNode(id, "entity", "model", null, attributes));
  }

  // API groups: namespace + one facade class with the operations as methods.
  // Container id MUST equal its display name — the Mermaid round trip
  // re-attaches children by namespace name.
  const groups = new Map<string, { nsId: string; classId: string }>();
  for (const op of operations) {
    if (!groups.has(op.groupKey)) {
      const nsId = unique(sanitizeIdentifier(op.groupLabel));
      const classId = unique(`${toPascal(op.groupLabel)}API`);
      arch.nodes.push(makeNode(nsId, "package", "container", null));
      groups.set(op.groupKey, { nsId, classId });
    }
  }
  for (const [, group] of groups) {
    // Placeholder keeps ordering stable even if a group ends up empty.
    arch.nodes.push(makeNode(group.classId, "controller", "rest", group.nsId));
  }

  const seenMethods = new Set<string>();
  for (const op of operations) {
    const group = groups.get(op.groupKey)!;
    const node = arch.nodes.find((n) => n.id === group.classId)!;
    const params = [...pathParamNames(op.path), ...(op.requestSchema ? [`body: ${sanitizeIdentifier(op.requestSchema)}`] : [])];
    const methodName = `${op.method.charAt(0)}${toPascal(op.path).slice(0, 28)}`;
    let uniqueMethod = `${methodName}_${params.length}`;
    let bump = 2;
    while (seenMethods.has(uniqueMethod)) uniqueMethod = `${methodName}_${params.length}_${bump++}`;
    seenMethods.add(uniqueMethod);
    node.methods.push({
      name: uniqueMethod,
      parameters: params.map((p) => ({ name: p, type: "string" })),
      returnType: op.responseSchema ? sanitizeIdentifier(op.responseSchema) : "void",
      visibility: "public",
      isStatic: false,
      isAbstract: false,
      isAsync: false,
      description: `${op.method} ${op.path}`,
    });

    if (op.requestSchema && schemas.has(op.requestSchema)) {
      arch.relationships.push(makeRelationship(`rel_req_${arch.relationships.length}`, group.classId, sanitizeIdentifier(op.requestSchema), "dependency", "accepts"));
    }
    if (op.responseSchema && schemas.has(op.responseSchema)) {
      arch.relationships.push(makeRelationship(`rel_res_${arch.relationships.length}`, group.classId, sanitizeIdentifier(op.responseSchema), "association", "returns"));
    }
  }

  // Schema composition (allOf) -> inheritance.
  for (const schema of schemas.values()) {
    if (schema.extends && schemas.has(schema.extends)) {
      arch.relationships.push(makeRelationship(`rel_ext_${schema.name}`, sanitizeIdentifier(schema.name), sanitizeIdentifier(schema.extends), "inheritance", "extends"));
    }
  }

  if (arch.nodes.length === 0) {
    warnings.push("No operations or schemas found — nothing to import.");
  }
  return architectureToMermaid(arch);
}

/* ----------------------- sequence diagram ----------------------- */

function buildSequenceDiagram(operations: Operation[], title: string, warnings: string[]): string {
  const lines: string[] = ["sequenceDiagram", `    autonumber`, ""];
  const participants = new Set<string>();
  const aliases = new Map<string, string>();
  const aliasFor = (groupKey: string, groupLabel: string): string => {
    if (!aliases.has(groupKey)) {
      const alias = sanitizeIdentifier(groupKey);
      aliases.set(groupKey, alias);
      lines.push(`    participant "${groupLabel}" as ${alias}`);
    }
    participants.add(groupKey);
    return aliases.get(groupKey)!;
  };
  void title;

  let count = 0;
  let truncated = false;
  for (const op of operations) {
    if (count >= MAX_SEQUENCE_MESSAGES) {
      truncated = true;
      break;
    }
    const alias = aliasFor(op.groupKey, op.groupLabel);
    lines.push(`    Client->>${alias}: ${op.method} ${op.path}`);
    count += 1;
    if (count < MAX_SEQUENCE_MESSAGES) {
      lines.push(`    ${alias}-->>Client: ${op.responseSchema ?? "2xx"}`);
      count += 1;
    }
  }
  if (truncated) {
    warnings.push(`Sequence flow truncated at ${MAX_SEQUENCE_MESSAGES} messages.`);
  }
  if (participants.size === 0) {
    lines.push(`    participant Client`);
    lines.push(`    note over Client: No operations found in the specification`);
  }
  return lines.join("\n") + "\n";
}

/* ----------------------------- entry ----------------------------- */

export function importOpenApi(source: string | unknown): OpenApiImportResult {
  const spec = parseSpec(source);
  const warnings: string[] = [];

  // Schemas first — operation extraction needs them to resolve $refs.
  const schemas = collectSchemas(spec);
  const paths = (spec.paths ?? {}) as Record<string, unknown>;
  const operations = collectOperations(paths, schemas, warnings);

  const info = (spec.info ?? {}) as Record<string, unknown>;
  const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Imported API";

  const classMermaid = buildClassDiagram(operations, schemas, title, warnings);
  const sequenceMermaid = buildSequenceDiagram(operations, title, warnings);

  const groups = new Set(operations.map((o) => o.groupKey));
  return {
    classMermaid,
    sequenceMermaid,
    stats: { operations: operations.length, schemas: schemas.size, groups: groups.size },
    warnings,
  };
}
