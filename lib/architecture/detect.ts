import type {
  Architecture,
  ArchitectureNode,
  ArchitectureRelationship,
  ArchitectureRelationshipType,
  DiagramType,
} from "@/types/diagram";
import { generateId } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* detectArchitectureFromText — NL requirements -> canonical model.     */
/* Relationship verbs, ownership phrases and cardinality markers are   */
/* turned into typed ArchitectureRelationships with multiplicities.    */
/* ------------------------------------------------------------------ */

export interface DetectionOptions {
  diagramType?: DiagramType;
  title?: string;
}

const VERB_PATTERNS: Array<{ pattern: RegExp; type: ArchitectureRelationshipType }> = [
  { pattern: /\b(?:inherits? from|extends)\b/i, type: "inheritance" },
  { pattern: /\bimplements\b/i, type: "implementation" },
  { pattern: /\b(?:composed of|consists of|made up of|owns|contains|has)\b/i, type: "composition" },
  { pattern: /\b(?:uses|employs|invokes|calls|includes)\b/i, type: "dependency" },
  { pattern: /\b(?:persists?|stores?|retrieves?|reads?|writes?|loads?|saves?)\b/i, type: "association" },
  { pattern: /\b(?:belongs to|part of|linked to|related to)\b/i, type: "aggregation" },
];

const STOP_WORDS = new Set([
  "The", "This", "That", "These", "Those", "Each", "Every", "Any", "Some",
  "A", "An", "Of", "And", "Or", "But", "For", "With", "When",
  "After", "Before", "Once", "All", "At", "By", "In", "On", "To", "From",
  "If", "Then", "Else", "Will", "Can", "May", "Must", "Should", "Has",
  "Have", "Its", "It", "I", "You", "We", "They", "No", "Yes",
]);

/** Best-effort singularization so "Orders" -> "Order". */
export function singularize(name: string): string {
  if (name.length <= 2) return name;
  if (/ies$/i.test(name) && name.length > 4) return name.slice(0, -3) + "y";
  if (/ses$|xes$|zes$|ches$|shes$/i.test(name)) return name.slice(0, -2);
  if (/ss$/i.test(name) || /us$/i.test(name)) return name;
  if (/(s|es)$/i.test(name) && /^[A-Z]/.test(name)) return name.slice(0, -1);
  return name;
}

/** All capitalized tokens (candidate entity names) in a sentence. */
export function extractEntities(sentence: string): string[] {
  const raw = sentence.match(/[A-Z][A-Za-z0-9_]{1,23}/g) ?? [];
  const seen = new Set<string>();
  const entities: string[] = [];
  for (const token of raw) {
    const cleaned = token.replace(/[^A-Za-z0-9_]/g, "");
    if (cleaned.length < 2) continue;
    if (STOP_WORDS.has(cleaned)) continue;
    const canonical = canonicalName(cleaned);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    entities.push(canonical);
  }
  return entities;
}

/** Convert cardinality language in a sentence to a multiplicity token. */
export function inferMultiplicityFromSentence(sentence: string): string {
  const text = sentence.toLowerCase();
  if (/(?:zero or one|zero or more).*?(?:per|to|of|for)/i.test(text) || /\b(?:optional)\b/i.test(text)) {
    return "0..1";
  }
  if (/(?:many|multiple|several|numerous|a lot|more than one|one or more|zero or more)/i.test(text)) {
    return "0..*";
  }
  if (/(?:exactly\s+one|only\s+one|a\s+single|exactly\s+1\b)/i.test(text)) {
    return "1";
  }
  if (/(?:at\s+least\s+one)/i.test(text)) {
    return "1..*";
  }
  return "1";
}

interface DetectedRelation {
  rel: ArchitectureRelationship;
}

function buildRelation(
  source: string,
  target: string,
  type: ArchitectureRelationshipType,
  sentence: string
): DetectedRelation {
  const label = relationLabel(sentence, type);
  const rel: ArchitectureRelationship = {
    id: `det_rel_${generateId("r")}`,
    source,
    target,
    type,
    label,
    sourceMultiplicity: "1",
    targetMultiplicity: inferMultiplicityFromSentence(sentence),
    direction: "forward",
    action: label,
    foreignKeyColumn: null,
    description: sentence,
  };
  return { rel };
}

function relationLabel(text: string, type: ArchitectureRelationshipType): string | null {
  if (type === "inheritance") return "inherits";
  if (type === "implementation") return "implements";
  if (type === "composition") {
    const m = /\b(?:composed of|consists of|has)\b/i.exec(text);
    return m ? m[0].toLowerCase() : "contains";
  }
  if (type === "aggregation") {
    const m = /\b(?:belongs to|related to|part of)\b/i.exec(text);
    return m ? m[0].toLowerCase() : "is part of";
  }
  const m = /\b(?:uses|stores|retrieves|reads|writes|persists|loads|saves|handles|manages|calls|links)\b/i.exec(text);
  return m ? m[1].toLowerCase() : null;
}

function detectType(text: string): ArchitectureRelationshipType {
  for (const { pattern, type } of VERB_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return "association";
}

/**
 * Extract a single relationship from one sentence when the syntax is
 * clear: <Subject> <verb> <Object> or "Object for Subject".
 */
function detectRelationshipInSentence(rawSentence: string): DetectedRelation | null {
  const article = /^(?:a|an|the|each|every)\s+/i.exec(rawSentence);
  const stripped = article ? rawSentence.slice(article[0].length) : rawSentence;
  const text = stripped.replace(/[.!?]+$/, "").trim();

  const inherit = /^([A-Z][A-Za-z0-9_]*)\s+(?:inherits\s+from|extends)\s+([A-Z][A-Za-z0-9_]*)/i.exec(text);
  if (inherit && inherit[1] !== inherit[2]) return buildRelation(canonicalName(inherit[1]), canonicalName(inherit[2]), "inheritance", text);

  const implementsN = /^([A-Z][A-Za-z0-9_]*)\s+implements\s+([A-Z][A-Za-z0-9_]*)/i.exec(text);
  if (implementsN && implementsN[1] !== implementsN[2]) return buildRelation(canonicalName(implementsN[1]), canonicalName(implementsN[2]), "implementation", text);

  const owns = /^([A-Z][A-Za-z0-9_]*)\s+(?:has|contains|owns|with|stores|uses|calls|retrieves|reads|writes|belongs\s+to|is\s+composed\s+of|consists\s+of)\s+(?:a\s+|an\s+|one\s+|many\s+|multiple\s+|several\s+)?([A-Z][A-Za-z0-9_]*?)(?:\b|$)/i.exec(text);
  if (owns && owns[1] !== owns[2]) {
    return buildRelation(canonicalName(owns[1]), canonicalName(owns[2]), detectType(text), text);
  }

  const forSubject = /^([A-Z][A-Za-z0-9_]*)\s+for\s+([A-Z][A-Za-z0-9_]*)(?:\b|$)/i.exec(text);
  if (forSubject && forSubject[1] !== forSubject[2]) {
    return buildRelation(canonicalName(forSubject[1]), canonicalName(forSubject[2]), "association", text);
  }

  return null;
}

/** Canonical entity name: singularized (Orders -> Order). */
export function canonicalName(name: string): string {
  return singularize(name);
}

/** Split requirement text into sentences, robustly. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?:\r?\n)+|(?<=[.!?])(?:\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Main entry: turn a natural-language requirements description into a
 * canonical Architecture. Detects entities from capitalized nouns and a
 * per-sentence relationship extraction passes.
 */
export function detectArchitectureFromText(text: string, options: DetectionOptions = {}): Architecture {
  const diagramType = options.diagramType ?? "CLASS";
  const sentences = splitSentences(text);
  const architecture: Architecture = {
    diagramType,
    title: options.title ?? "Generated Architecture",
    nodes: [],
    relationships: [],
    notes: [],
    sourceText: text,
  };

  const nodes = new Map<string, ArchitectureNode>();
  const relationships: ArchitectureRelationship[] = [];
  const seenPairs = new Set<string>();

  const ensureNode = (name: string): ArchitectureNode => {
    const clean = name.replace(/[^A-Za-z0-9_]/g, "");
    if (!clean) return null as never;
    const existing = nodes.get(clean);
    if (existing) return existing;
    const node: ArchitectureNode = {
      id: clean,
      name: clean,
      kind: kindForName(clean),
      stereotype: stereotypeFor(clean),
      parentId: null,
      attributes: [],
      methods: [],
      isAbstract: false,
      isInterface: false,
      notes: [],
    };
    nodes.set(clean, node);
    return node;
  };

  for (const sentence of sentences.slice(0, 80)) {
    for (const name of extractEntities(sentence)) {
      ensureNode(name);
    }
  }

  for (const sentence of sentences.slice(0, 120)) {
    const hit = detectRelationshipInSentence(sentence);
    if (!hit) continue;
    const s = hit.rel.source;
    const t = hit.rel.target;
    if (s === t) continue;
    // require both to be real entities (either exist in map, or added now)
    ensureNode(s);
    ensureNode(t);
    const key = `${s}|${t}|${hit.rel.type}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    relationships.push(hit.rel);
  }

  architecture.nodes = Array.from(nodes.values());
  architecture.relationships = relationships;
  return architecture;
}

function kindForName(name: string): ArchitectureNode["kind"] {
  if (/controller$/i.test(name)) return "controller";
  if (/service$/i.test(name)) return "service";
  if (/repository$/i.test(name)) return "repository";
  if (/database|db$/i.test(name)) return "database";
  if (/entity$/i.test(name)) return "entity";
  if (/interface$/i.test(name)) return "interface";
  if (/component$/i.test(name)) return "component";
  return "class";
}

function stereotypeFor(name: string): string | null {
  if (/controller$/i.test(name)) return "controller";
  if (/service$/i.test(name)) return "service";
  if (/repository$/i.test(name)) return "repository";
  if (/database|db$/i.test(name)) return "database";
  if (/entity$/i.test(name)) return "entity";
  if (/interface$/i.test(name)) return "interface";
  return null;
}