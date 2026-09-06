import type {
  DiagramType,
  UMLAttribute,
  UMLClass,
  UMLLink,
  UMLMethod,
  UMLModel,
  Visibility,
} from "@/types/diagram";

const VISIBILITY_MAP: Record<string, Visibility> = {
  "+": "public",
  "-": "private",
  "#": "protected",
};

export class MermaidParseError extends Error {
  readonly line: number | null;

  constructor(message: string, line: number | null = null) {
    super(message);
    this.name = "MermaidParseError";
    this.line = line;
  }
}

interface ParsedBlock {
  className: string;
  body: string[];
}

function stripComment(line: string): string {
  const idx = line.indexOf("%%");
  return idx >= 0 ? line.slice(0, idx) : line;
}

interface ParsedBlock {
  className: string;
  body: string[];
  /** Namespace path (outermost first) the class was declared inside. */
  namespacePath: string[];
}

function extractBlock(lines: string[]): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  // Frame stack distinguishes class-block closes from namespace closes:
  // both are bare "}" lines, so content alone is ambiguous.
  type Frame = { kind: "class"; block: ParsedBlock } | { kind: "namespace"; name: string };
  const stack: Frame[] = [];
  const namespacePath = (): string[] =>
    stack.filter((f): f is Extract<Frame, { kind: "namespace" }> => f.kind === "namespace").map((f) => f.name);

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (line === "}") {
      const frame = stack.pop();
      if (frame?.kind === "class") blocks.push(frame.block);
      continue;
    }
    const top = stack[stack.length - 1];
    if (top?.kind === "class") {
      // Member lines belong to the enclosing class even if they contain braces.
      top.block.body.push(line);
      continue;
    }
    const nsMatch = /^namespace\s+(.+?)\s*\{$/.exec(line);
    if (nsMatch) {
      stack.push({ kind: "namespace", name: nsMatch[1].trim() });
      continue;
    }
    const open = line.indexOf("{");
    if (open > 0 && line.endsWith("}")) {
      blocks.push({
        className: stripClassKeyword(line.slice(0, open).trim()),
        body: [],
        namespacePath: namespacePath(),
      });
    } else if (open > 0) {
      stack.push({
        kind: "class",
        block: { className: stripClassKeyword(line.slice(0, open).trim()), body: [], namespacePath: namespacePath() },
      });
    }
  }
  return blocks;
}

function stripClassKeyword(name: string): string {
  return name.replace(/^class\s+/i, "");
}

function parseVisibility(token: string): { visibility: Visibility; rest: string } {
  const first = token[0];
  if (first === "+" || first === "-" || first === "#") {
    return { visibility: VISIBILITY_MAP[first], rest: token.slice(1) };
  }
  return { visibility: "public", rest: token };
}

function isMethodToken(token: string): boolean {
  return /\(.*\)/.test(token);
}

function parseMember(raw: string): { attribute: UMLAttribute } | { method: UMLMethod } {
  const { visibility, rest } = parseVisibility(raw.trim());
  const isStatic = rest.endsWith("$");
  const body = isStatic ? rest.slice(0, -1) : rest;

  if (isMethodToken(body)) {
    const nameMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/.exec(body);
    const returnMatch = /\s*:\s*(.+)$/.exec(body.replace(/^[^(]+\([^)]*\)/, ""));
    const name = nameMatch ? nameMatch[1] : body.replace(/\s*\(.*\)\s*$/, "").trim();
    const paramsRaw = nameMatch ? nameMatch[2] : "";
    const parameters = paramsRaw
      ? paramsRaw.split(",").map((p) => {
          const [pname, ptype] = p.trim().split(/\s+/);
          return { name: pname ?? "", type: ptype ?? "unknown" };
        })
      : [];
    const returnType = returnMatch ? returnMatch[1].trim() : "void";
    return {
      method: {
        name,
        parameters,
        returnType,
        visibility,
        isStatic,
        isAbstract: name.startsWith("_") || /\{\s*\}/.test(body),
      },
    };
  }

  const colon = body.indexOf(":");
  const name = colon >= 0 ? body.slice(0, colon).trim() : body.trim();
  const type = colon >= 0 ? body.slice(colon + 1).trim() : "unknown";
  return {
    attribute: { name, type, visibility, isStatic, isDerived: false },
  };
}

const RELATION_PATTERNS: Array<{
  regex: RegExp;
  type: UMLLink["type"];
}> = [
  { regex: /\s--\|\>\s/, type: "inheritance" },
  { regex: /\s\.\.\|\>\s/, type: "implementation" },
  { regex: /\s\*\--\s/, type: "composition" },
  { regex: /\so\--\s/, type: "aggregation" },
  { regex: /\s\.\.\>\s/, type: "dependency" },
  { regex: /\s--\>\s/, type: "association" },
  { regex: /\s--\s/, type: "association" },
  { regex: /\s\.\.\s/, type: "dependency" },
];

interface RelationMatch {
  from: string;
  to: string;
  type: UMLLink["type"];
  label: string | null;
  fromMultiplicity: string | null;
  toMultiplicity: string | null;
}

interface RelationSide {
  name: string;
  multiplicity: string | null;
}

/**
 * Parse one side of a relationship edge. Accepts a bare class name or a name
 * with a quoted multiplicity on either order:
 *   `User`, `User "1"`, `"1" User`
 */
function parseSide(raw: string): RelationSide | null {
  let m = /^([A-Za-z_$][\w$]*)\s+"([^"]+)"$/.exec(raw.trim());
  if (m) return { name: m[1], multiplicity: m[2] };
  m = /^"([^"]+)"\s+([A-Za-z_$][\w$]*)$/.exec(raw.trim());
  if (m) return { name: m[2], multiplicity: m[1] };
  if (/^[A-Za-z_$][\w$]*$/.test(raw.trim())) return { name: raw.trim(), multiplicity: null };
  return null;
}

function parseRelation(raw: string): RelationMatch | null {
  const cleaned = raw.replace(/^class\s+/i, "").trim();
  for (const pattern of RELATION_PATTERNS) {
    const parts = cleaned.split(pattern.regex);
    if (parts.length >= 2) {
      const leftRaw = parts[0].trim();
      const rightRaw = parts.slice(1).join(" ").trim();

      const left = parseSide(leftRaw);
      const labelMatch = /:\s*(.+)$/.exec(rightRaw);
      const rightSource = labelMatch ? rightRaw.slice(0, labelMatch.index).trim() : rightRaw.trim();
      const right = parseSide(rightSource);
      const label = labelMatch ? labelMatch[1].trim().replace(/^"|"$/g, "") : null;

      if (!left || !right) return null;
      return {
        from: left.name,
        to: right.name,
        type: pattern.type,
        label,
        fromMultiplicity: left.multiplicity,
        toMultiplicity: right.multiplicity,
      };
    }
  }
  return null;
}

function extractStereotype(className: string): { name: string; stereotype: string | null } {
  const match = /^(.*?)\s*<<([^>]+)>>$/.exec(className);
  if (match) return { name: match[1].trim(), stereotype: match[2].trim() };
  return { name: className, stereotype: null };
}

export function parseMermaidClassDiagram(code: string): UMLModel {
  const lines = code.split(/\r?\n/);
  const blocks = extractBlock(lines);
  const classes = new Map<string, UMLClass>();
  const links: UMLLink[] = [];

  const ensureClass = (rawName: string, parentId: string | null = null): UMLClass => {
    const { name, stereotype } = extractStereotype(rawName);
    if (!classes.has(name)) {
      classes.set(name, {
        id: name,
        name,
        stereotype,
        parentId,
        attributes: [],
        methods: [],
        isAbstract: false,
        isInterface: stereotype?.toLowerCase() === "interface",
      });
    }
    return classes.get(name)!;
  };

  // Namespace containment (C4 containers): collect the namespace tree from
  // block paths, then attach every declared class to its leaf namespace.
  const namespaceParents = new Map<string, string | null>();
  for (const block of blocks) {
    for (let i = 0; i < block.namespacePath.length; i += 1) {
      const name = block.namespacePath[i];
      if (!namespaceParents.has(name)) {
        namespaceParents.set(name, i > 0 ? block.namespacePath[i - 1] : null);
      }
    }
  }

  for (const block of blocks) {
    const { name, stereotype } = extractStereotype(block.className);
    const parentNs = block.namespacePath[block.namespacePath.length - 1] ?? null;
    const cls = ensureClass(name, parentNs);
    cls.stereotype = stereotype;
    cls.isInterface = stereotype?.toLowerCase() === "interface";
    cls.isAbstract = stereotype?.toLowerCase() === "abstract";
    for (const member of block.body) {
      const parsed = parseMember(member);
      if ("attribute" in parsed) {
        if (!cls.attributes.some((a) => a.name === parsed.attribute.name)) {
          cls.attributes.push(parsed.attribute);
        }
      } else {
        if (!cls.methods.some((m) => m.name === parsed.method.name)) {
          cls.methods.push(parsed.method);
        }
      }
    }
  }

  // Implicit container nodes: namespaces referenced only as groupings must
  // still exist in the model so they can be drilled into and serialized.
  for (const [nsName, parent] of namespaceParents) {
    const container = ensureClass(nsName, parent);
    if (!container.stereotype) container.stereotype = "container";
  }

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (line.includes("{") || line === "}") continue;
    if (/^direction/i.test(line)) continue;
    if (line.startsWith("classDiagram")) continue;
    if (line.startsWith("namespace ")) continue;

    if (!line.includes("--") && !line.includes("..")) {
      if (/^class\s+/i.test(line)) {
        // Bare declarations AND annotated ones ("class Foo <<stereo>>") —
        // previously the annotated form fell through and was dropped,
        // losing the stereotype on round trip.
        const { name, stereotype } = extractStereotype(line.replace(/^class\s+/i, ""));
        if (/^[A-Za-z_$][\w$]*$/.test(name)) {
          const cls = ensureClass(name);
          if (stereotype) {
            cls.stereotype = stereotype;
            cls.isInterface = stereotype.toLowerCase() === "interface";
            cls.isAbstract = stereotype.toLowerCase() === "abstract";
          }
        }
      }
      continue;
    }

    const relation = parseRelation(line);
    if (relation) {
      ensureClass(relation.from);
      ensureClass(relation.to);
      links.push({
        id: `${relation.from}_${relation.to}_${links.length}`,
        from: relation.from,
        to: relation.to,
        type: relation.type,
        label: relation.label,
        fromMultiplicity: relation.fromMultiplicity,
        toMultiplicity: relation.toMultiplicity,
      });
    }
  }

  return {
    title: "Untitled",
    diagramType: "CLASS",
    classes: Array.from(classes.values()),
    links,
  };
}

export function modelToMermaid(model: UMLModel): string {
  const lines: string[] = ["classDiagram", "    direction TB", ""];

  const renderClass = (cls: UMLClass, indent: string): void => {
    const stereotype = cls.stereotype ? `<<${cls.stereotype}>>` : "";
    lines.push(`${indent}class ${cls.name}${stereotype} {`);
    for (const attr of cls.attributes) {
      const vis = attr.visibility === "public" ? "+" : attr.visibility === "private" ? "-" : "#";
      const suffix = attr.isStatic ? "$" : "";
      lines.push(`${indent}    ${vis}${attr.name}${attr.type !== "unknown" ? ` : ${attr.type}` : ""}${suffix}`);
    }
    for (const method of cls.methods) {
      const vis = method.visibility === "public" ? "+" : method.visibility === "private" ? "-" : "#";
      const params = method.parameters.map((p) => `${p.name}${p.type ? `: ${p.type}` : ""}`).join(", ");
      const suffix = method.isStatic ? "$" : "";
      lines.push(`${indent}    ${vis}${method.name}(${params}) : ${method.returnType}${suffix}`);
    }
    lines.push(`${indent}}`);
    lines.push("");
  };

  // C4 containment: children are nested inside `namespace` blocks (one
  // level per hierarchy step), top-level classes stay bare.
  const byId = new Map(model.classes.map((c) => [c.id, c]));
  const childrenOf = (parentId: string | null): UMLClass[] =>
    model.classes.filter((c) => (c.parentId ?? null) === parentId && c.id !== parentId);
  const emit = (parentId: string | null, indent: string): void => {
    for (const cls of childrenOf(parentId)) {
      const kids = childrenOf(cls.id);
      if (kids.length > 0) {
        lines.push(`${indent}namespace ${cls.name} {`);
        emit(cls.id, `${indent}    `);
        lines.push(`${indent}}`);
        lines.push("");
      } else {
        renderClass(cls, indent);
      }
    }
  };
  emit(null, "    ");
  // Guard against orphaned parents (parentId pointing at a dropped node).
  for (const cls of model.classes) {
    if (cls.parentId && !byId.has(cls.parentId)) renderClass(cls, "    ");
  }

  for (const link of model.links) {
    const mermaidOp = relationToMermaid(link.type);
    const left = link.fromMultiplicity ? `${link.from} "${link.fromMultiplicity}"` : link.from;
    const right = link.toMultiplicity
      ? `${link.to} "${link.toMultiplicity}"${link.label ? ` : ${link.label}` : ""}`
      : `${link.to}${link.label ? ` : ${link.label}` : ""}`;
    lines.push(`    ${left} ${mermaidOp} ${right}`);
  }
  return lines.join("\n").trim() + "\n";
}

export function relationToMermaid(type: UMLLink["type"]): string {
  switch (type) {
    case "inheritance":
      return "--|>";
    case "implementation":
      return "..|>";
    case "composition":
      return "*--";
    case "aggregation":
      return "o--";
    case "dependency":
      return "..>";
    case "association":
      return "-->";
  }
}

export function detectDiagramType(code: string): DiagramType {
  const first = code.trim().split(/\r?\n/)[0] ?? "";
  if (/^classDiagram/i.test(first)) return "CLASS";
  if (/^sequenceDiagram/i.test(first)) return "SEQUENCE";
  if (/^erDiagram/i.test(first)) return "ER";
  if (/^stateDiagram/i.test(first)) return "STATE";
  if (/^flowchart|^graph/i.test(first)) return "ACTIVITY";
  if (/^gantt/i.test(first)) return "ACTIVITY";
  return "CLASS";
}

export function isMermaidModelType(code: string): boolean {
  return /^\s*classDiagram/i.test(code);
}

export function modelToPlantUml(model: UMLModel): string {
  const lines: string[] = ["@startuml", ""];
  for (const cls of model.classes) {
    if (cls.isInterface) {
      lines.push(`interface ${cls.name} {`);
    } else {
      lines.push(`class ${cls.name}${cls.stereotype ? ` <<${cls.stereotype}>>` : ""} {`);
    }
    for (const attr of cls.attributes) {
      const vis = attr.visibility === "public" ? "+" : attr.visibility === "private" ? "-" : "#";
      lines.push(`  ${vis}${attr.name}: ${attr.type}`);
    }
    for (const method of cls.methods) {
      const vis = method.visibility === "public" ? "+" : method.visibility === "private" ? "-" : "#";
      const params = method.parameters.map((p) => `${p.name}: ${p.type}`).join(", ");
      lines.push(`  ${vis}${method.name}(${params}): ${method.returnType}`);
    }
    lines.push("}");
    lines.push("");
  }
  for (const link of model.links) {
    const arrow =
      link.type === "inheritance" ? "<|--" : link.type === "implementation" ? "..|>" : link.type === "composition" ? "*--" : link.type === "aggregation" ? "o--" : link.type === "dependency" ? "..>" : "-->";
    lines.push(`${link.from} ${arrow} ${link.to}${link.label ? ` : ${link.label}` : ""}`);
  }
  lines.push("@enduml");
  return lines.join("\n");
}