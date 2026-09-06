import type { DiagramType, UMLAttribute, UMLClass, UMLMethod, UMLModel, Visibility } from "@/types/diagram";

const STOPWORDS = new Set([
  "A", "An", "The", "System", "Application", "App", "Platform", "Project", "Product",
  "Service", "API", "UI", "Web", "Webs", "This", "That", "These", "It", "Its", "We",
  "Users", "Their", "Data", "Database", "SQL", "They", "If", "When", "How", "Each",
  "One", "Many", "All", "Other", "Main", "Any", "New", "Such", "Our", "Your", "Model",
]);

const RELATION_PATTERNS: Array<{
  regex: RegExp;
  type: UMLModel["links"][number]["type"];
}> = [
  { regex: /(?:extends|inherits?\s+from)\s+([A-Z][A-Za-z0-9]+)/, type: "inheritance" },
  { regex: /implements\s+([A-Z][A-Za-z0-9]+)/, type: "implementation" },
  { regex: /(?:depends?\s+on|uses)\s+([A-Z][A-Za-z0-9]+)/, type: "dependency" },
  { regex: /has\s+many\s+([A-Z][A-Za-z0-9]+)/, type: "aggregation" },
  { regex: /has\s+(?:one|a\s+single)\s+([A-Z][A-Za-z0-9]+)/, type: "composition" },
  { regex: /contains\s+([A-Z][A-Za-z0-9]+)/, type: "composition" },
  { regex: /owns?\s+([A-Z][A-Za-z0-9]+)/, type: "composition" },
  { regex: /composed\s+of\s+([A-Z][A-Za-z0-9]+)/, type: "composition" },
];

const METHOD_VERBS = new Set([
  "register", "login", "logout", "create", "delete", "update", "read", "fetch", "save",
  "load", "send", "receive", "process", "validate", "authenticate", "authorize", "cancel",
  "approve", "reject", "pay", "refund", "checkout", "calculate", "compute", "render",
  "serialize", "parse", "convert", "retry", "cancel", "start", "stop", "pause", "resume",
  "notify", "subscribe", "publish", "query", "search", "filter", "sort", "export", "import",
  "download", "upload", "encrypt", "decrypt", "refresh", "issue", "revoke", "verify",
  "generate", "submit", "confirm", "cancel", "schedule", "complete", "fail", "reset",
]);

const COMMON_ATTRS = new Set([
  "id", "name", "email", "password", "firstName", "lastName", "createdAt", "updatedAt",
  "deletedAt", "status", "type", "role", "token", "expiresAt", "address", "phone",
  "title", "description", "amount", "currency", "price", "quantity", "userId", "total",
]);

interface ExtractionContext {
  subject: string | null;
  mode: "entity" | "methods" | "attributes" | "none";
}

function extractEntities(text: string): string[] {
  const seen = new Map<string, number>();
  const tokens = text.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (STOPWORDS.has(token)) continue;
    if (token === "I" || token === "IDs") continue;
    if (/^[A-Z][A-Za-z0-9_$]+$/.test(token) || /^[A-Z]+$/.test(token)) {
      if (METHOD_VERBS.has(token.toLowerCase())) continue;
      seen.set(token, (seen.get(token) ?? 0) + 1);
    }
  }
  const common = Math.max(1, Math.max(...Array.from(seen.values())));
  return Array.from(seen.entries())
    .filter(([, count]) => count >= Math.max(2, Math.floor(common / 2)) || count >= 3)
    .map(([name]) => name)
    .filter((name) => !/^(IT|ID|API|URL|SQL|SSO|OTP|REST|JWT|MFA|DB)$/.test(name))
    .sort((a, b) => b.length - a.length);
}

function classFrom(name: string, attributes: Map<string, UMLAttribute[]>, methods: Map<string, UMLMethod[]>): UMLClass {
  return {
    id: name,
    name,
    stereotype: null,
    parentId: null,
    attributes: (attributes.get(name) ?? []).filter((a, i, all) => all.findIndex((x) => x.name === a.name) === i),
    methods: (methods.get(name) ?? []).filter((m, i, all) => all.findIndex((x) => x.name === m.name) === i),
    isAbstract: false,
    isInterface: false,
  };
}

export function extractModelFromText(text: string): UMLModel {
  const sentences = text
    .replace(/\n+/g, ". ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const entities = extractEntities(text);
  const attributes = new Map<string, UMLAttribute[]>();
  const methods = new Map<string, UMLMethod[]>();
  const links: UMLModel["links"] = [];
  const linkKeys = new Set<string>();

  const context: ExtractionContext = { subject: null, mode: "none" };
  let linkCounter = 0;

  const pushMethod = (subject: string, verb: string): void => {
    const list = methods.get(subject) ?? [];
    const name = verb.toLowerCase();
    if (!list.some((m) => m.name === name)) {
      list.push({
        name,
        parameters: [],
        returnType: "void",
        visibility: "public",
        isStatic: false,
        isAbstract: false,
      });
      methods.set(subject, list);
    }
  };

  const pushAttribute = (subject: string, attr: { name: string; type: string }): void => {
    const list = attributes.get(subject) ?? [];
    const visibility: Visibility = attr.name === "id" || attr.name.startsWith("_") ? "private" : "public";
    if (!list.some((a) => a.name === attr.name)) {
      list.push({ name: attr.name, type: attr.type, visibility, isStatic: false, isDerived: false });
    }
    attributes.set(subject, list);
  };

  const addLink = (from: string, to: string, type: UMLModel["links"][number]["type"], label: string | null = null): void => {
    if (from === to) return;
    const key = `${from}|${type}|${to}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({
      id: `link_${linkCounter++}`,
      from,
      to,
      type,
      label,
      fromMultiplicity: type === "aggregation" ? "1" : null,
      toMultiplicity: type === "aggregation" ? "0..*" : type === "composition" ? "1" : null,
    });
  };

  for (const sentence of sentences) {
    const entityMention = entities.find((e) => sentence.includes(e) && /^[A-Z]/.test(e));
    if (entityMention) context.subject = entityMention;

    if (/\b(fields|attributes|properties)\b/i.test(sentence)) {
      context.mode = "attributes";
      continue;
    }
    if (/\b(methods|operations|behaviors|responsibilities)\b/i.test(sentence)) {
      context.mode = "methods";
      continue;
    }
    if (/\bentities?\b|has\s+the\s+following/i.test(sentence)) {
      context.mode = "entity";
      continue;
    }

    let matched = false;
    for (const pattern of RELATION_PATTERNS) {
      const match = pattern.regex.exec(sentence);
      if (match && context.subject) {
        const target = match[1];
        if (entities.includes(target)) {
          addLink(context.subject, target, pattern.type);
          matched = true;
          context.mode = "none";
          break;
        }
      }
    }
    if (matched) continue;

    const methodMatches = sentence.match(
      /\b(?:can|must|should|will|may|does|to)\s+([a-z][a-z0-9]+(?:\s+[a-z][a-z0-9]+){0,3})\b/g
    );
    if (methodMatches && context.subject) {
      for (const raw of methodMatches) {
        const verb = raw.split(/\s+/)[1];
        if (METHOD_VERBS.has(verb)) {
          pushMethod(context.subject, verb);
          matched = true;
        }
      }
      if (matched) continue;
    }

    if (context.mode === "attributes" && context.subject) {
      const rawAttrs = sentence.match(/[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)?/g) ?? [];
      for (const raw of rawAttrs) {
        const clean = raw.toLowerCase();
        if (clean === context.subject.toLowerCase()) continue;
        if (COMMON_ATTRS.has(clean) || clean.startsWith(context.subject.toLowerCase())) {
          const type = /(?:date|time)/.test(clean) ? "DateTime" : /(?:id|count|price|amount|quantity|total)/.test(clean) ? "number" : "string";
          pushAttribute(context.subject, { name: raw, type });
        }
      }
    }
  }

  const usedEntities = new Set(links.flatMap((l) => [l.from, l.to]));
  const entityClasses = entities
    .filter((e) => usedEntities.has(e) || attributes.has(e) || methods.has(e) || links.length === 0)
    .map((name) => classFrom(name, attributes, methods));

  if (entityClasses.length === 0) {
    return {
      title: "Generated Diagram",
      diagramType: "CLASS",
      classes: [classFrom("System", attributes, methods)],
      links,
    };
  }

  return {
    title: "Generated Diagram",
    diagramType: "CLASS",
    classes: entityClasses,
    links,
  };
}

export function modelToMarkdown(model: UMLModel): string {
  const lines: string[] = [`# System Architecture — ${model.title}`, ""];
  lines.push(`**Overview.** This document describes a system of **${model.classes.length} classes** and **${model.links.length} relationships**.`);
  lines.push("");
  lines.push("## Class Inventory", "");
  lines.push("| Class | Stereotype | Attributes | Methods |");
  lines.push("|-------|-----------|------------|---------|");
  for (const cls of model.classes) {
    lines.push(
      `| ${cls.name} | ${cls.stereotype ?? "—"} | ${cls.attributes.length} | ${cls.methods.length} |`
    );
  }
  lines.push("");
  lines.push("## Relationships", "");
  for (const link of model.links) {
    lines.push(`- \`${link.from}\` —**${link.type}**→ \`${link.to}\`${link.label ? ` *(${link.label})*` : ""}`);
  }
  lines.push("");
  lines.push("## Design Patterns");
  const patterns: string[] = [];
  const services = model.classes.filter((c) => /Service|Repository|Controller|Manager|Factory/i.test(c.name));
  if (services.length > 0) patterns.push(`**Service Layer:** ${services.map((s) => s.name).join(", ")} encapsulate business logic behind stable interfaces.`);
  const interfaces = model.classes.filter((c) => c.isInterface);
  if (interfaces.length > 0) patterns.push(`**Interfaces:** ${interfaces.map((i) => i.name).join(", ")} decouple consumers from implementations.`);
  if (patterns.length === 0) patterns.push("No explicit patterns detected; the structure favors direct responsibility ownership.");
  lines.push(...patterns);
  lines.push("");
  lines.push("## Data Flow");
  const roots = model.classes.filter((c) => !model.links.some((l) => l.to === c.id));
  if (roots.length > 0) {
    lines.push(`Entry points: ${roots.map((r) => r.name).join(", ")}.`);
  } else {
    lines.push("No single entry point detected — the system is internally connected.");
  }
  lines.push("");
  lines.push("## Key Decisions");
  lines.push("- Responsibilities are separated across dedicated classes (single-responsibility leaning).");
  lines.push("- Relationships favor composition over inheritance where lifecycle matters.");
  lines.push("- Service classes centralize orchestration to keep entities as data holders.");
  lines.push("");
  return lines.join("\n");
}

export function erMermaidFromTables(tables: Array<{ name: string; columns: Array<{ name: string; type: string; isPK: boolean; isFK: boolean }>; fks: Array<{ from: string; to: string; column: string }> }>): string {
  const lines = ["erDiagram"];
  const seen = new Set<string>();
  for (const table of tables) {
    for (const fk of table.fks) {
      const key = `${table.name}|${fk.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`    ${table.name} ||--o{ ${fk.to} : "references"`);
    }
  }
  for (const table of tables) {
    lines.push(`    ${table.name} {`);
    for (const col of table.columns) {
      const flags = [col.isPK ? "PK" : "", col.isFK ? "FK" : ""].filter(Boolean).join(" ");
      lines.push(`        ${col.type} ${col.name}${flags ? ` ${flags}` : ""}`);
    }
    lines.push("    }");
  }
  return lines.join("\n");
}

export function sequenceFromModel(model: UMLModel): string {
  const lines = ["sequenceDiagram"];
  const actors = model.classes.slice(0, 6);
  for (const actor of actors) lines.push(`    participant ${actor.name}`);
  lines.push("");
  if (actors.length >= 2) {
    lines.push(`    ${actors[0].name}->>${actors[1].name}: request()`);
    lines.push(`    activate ${actors[1].name}`);
    lines.push(`    ${actors[1].name}-->>${actors[0].name}: response`);
    lines.push(`    deactivate ${actors[1].name}`);
  } else {
    lines.push(`    ${actors[0]?.name ?? "System"}->>${actors[0]?.name ?? "System"}: init`);
  }
  return lines.join("\n");
}

export function diagramTypeFromText(text: string): DiagramType {
  const lower = text.toLowerCase();
  if (/(sequence|interaction|message flow)/.test(lower)) return "SEQUENCE";
  if (/(database|schema|tables?|er diagram|entities? and their relationships)/.test(lower)) return "ER";
  if (/(state machine|states? and transitions)/.test(lower)) return "STATE";
  if (/(workflow|process|business flow|activity)/.test(lower)) return "ACTIVITY";
  return "CLASS";
}