import type { Architecture, ArchitectureNode } from "@/types/diagram";
import { architectureToMermaid } from "@/lib/architecture/serialization";

/**
 * GitHub repo ingestion (Epic 4) — file tree → Architecture.
 *
 * Pure module: array of {path, content} in, Mermaid erDiagram/classDiagram out.
 * No network, no token handling here — that lives in the API route.
 * The file tree is expected from GitHub's git/trees API (recursive) with
 * contents fetched separately.
 *
 * Heuristics are intentionally regex-based (no heavy parsers) so the
 * importer stays fast and dependency-free. It handles the common cases
 * across TS/JS, Python, and Java — enough to auto-draft an architecture
 * that the user then refines in the canvas.
 */

export interface RepoFile {
  path: string;
  content: string;
}

export interface GitHubImportResult {
  mermaid: string;
  stats: { files: number; classes: number; modules: number };
  warnings: string[];
}

export class GitHubImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubImportError";
  }
}

const MAX_FILES = 200;
const MAX_CLASSES = 300;

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|java|kt|go|rb|php|cs|cpp|hpp|c|h)$/i.test(path);
}

function dirOf(path: string): string | null {
  const slash = path.lastIndexOf("/");
  if (slash === -1) return null;
  return path.slice(0, slash);
}

function sanitizeName(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
  return clean || "Unnamed";
}

function extractClasses(file: RepoFile): Array<{ name: string; extends?: string; implements?: string[] }> {
  const classes: Array<{ name: string; extends?: string; implements?: string[] }> = [];
  const content = file.content;
  const isPython = file.path.endsWith(".py");

  if (isPython) {
    const pyRe = /^\s*class\s+(\w+)(?:\s*\(([^)]*)\))?\s*:/gm;
    let m: RegExpExecArray | null;
    while ((m = pyRe.exec(content)) !== null) {
      const name = sanitizeName(m[1]);
      const bases = m[2] ? m[2].split(",").map((s) => sanitizeName(s.trim())).filter(Boolean) : [];
      const ext = bases[0];
      const impl = bases.slice(1);
      if (name && !classes.some((c) => c.name === name)) {
        classes.push({ name, extends: ext, implements: impl.length ? impl : undefined });
      }
    }
    return classes;
  }

  // TypeScript / JavaScript / Java / Kotlin
  let m: RegExpExecArray | null;
  const classRe = /(?:export\s+)?(?:abstract\s+)?(?:public\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
  while ((m = classRe.exec(content)) !== null) {
    const name = sanitizeName(m[1]);
    const ext = m[2] ? sanitizeName(m[2].trim()) : undefined;
    const impl = m[3] ? m[3].split(",").map((s) => sanitizeName(s.trim())).filter(Boolean) : undefined;
    if (name) classes.push({ name, extends: ext, implements: impl });
  }

  const ifaceRe = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?/g;
  while ((m = ifaceRe.exec(content)) !== null) {
    const name = sanitizeName(m[1]);
    const ext = m[2] ? sanitizeName(m[2].split(",")[0]?.trim() ?? "") : undefined;
    if (name && !classes.some((c) => c.name === name)) {
      classes.push({ name, extends: ext });
    }
  }

  return classes;
}

function makeNode(name: string, parentId: string | null): ArchitectureNode {
  return {
    id: name,
    name,
    kind: "class",
    stereotype: null,
    parentId,
    attributes: [],
    methods: [],
    isAbstract: false,
    isInterface: false,
    notes: [],
  };
}

export function importGitHubRepo(files: RepoFile[]): GitHubImportResult {
  if (!files || files.length === 0) throw new GitHubImportError("No files provided — the repository appears empty.");
  const warnings: string[] = [];

  const sourceFiles = files.filter((f) => isSourceFile(f.path));
  if (sourceFiles.length === 0) throw new GitHubImportError("No source files found (looked for .ts/.js/.py/.java etc.).");

  const limited = sourceFiles.slice(0, MAX_FILES);
  if (sourceFiles.length > MAX_FILES) warnings.push(`Scanned ${MAX_FILES} of ${sourceFiles.length} source files — the rest were skipped.`);

  // Collect folders as potential C4 containers (like OpenAPI namespaces)
  const folders = new Set<string>();
  for (const f of limited) {
    const dir = dirOf(f.path);
    if (dir) folders.add(dir);
  }

  const arch: Architecture = { diagramType: "CLASS", title: "Imported Repo", nodes: [], relationships: [], notes: [], sourceText: null };
  const seen = new Set<string>();
  const folderNodes = new Map<string, string>(); // dir -> node id

  // Create folder containers first (so parentIds resolve)
  for (const dir of folders) {
    const name = sanitizeName(dir.split("/").pop() ?? dir);
    const id = name + "_pkg";
    if (!seen.has(id)) {
      seen.add(id);
      const parentDir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : null;
      const parentId = parentDir && folders.has(parentDir) ? sanitizeName(parentDir.split("/").pop() ?? parentDir) + "_pkg" : null;
      folderNodes.set(dir, id);
      arch.nodes.push({ ...makeNode(id, parentId), name: dir.split("/").pop() ?? dir, stereotype: "package", kind: "package" as const });
    }
  }

  let classCount = 0;
  const classToFolder = new Map<string, string | null>();
  for (const file of limited) {
    const dir = dirOf(file.path);
    const parentId = dir ? folderNodes.get(dir) ?? null : null;
    const classes = extractClasses(file);
    for (const cls of classes) {
      if (classCount >= MAX_CLASSES) {
        warnings.push(`Truncated at ${MAX_CLASSES} classes — remaining classes were skipped.`);
        break;
      }
      if (seen.has(cls.name)) continue;
      seen.add(cls.name);
      classCount += 1;
      arch.nodes.push(makeNode(cls.name, parentId));
      classToFolder.set(cls.name, parentId);
      // Inheritance / implementation edges if target exists in repo
      if (cls.extends) {
        arch.relationships.push({
          id: `rel_${arch.relationships.length}`,
          source: cls.name,
          target: cls.extends,
          type: "inheritance",
          label: "extends",
          sourceMultiplicity: "",
          targetMultiplicity: "",
          direction: "forward",
          action: null,
          foreignKeyColumn: null,
        });
      }
      if (cls.implements) {
        for (const iface of cls.implements) {
          arch.relationships.push({
            id: `rel_${arch.relationships.length}`,
            source: cls.name,
            target: iface,
            type: "implementation",
            label: "implements",
            sourceMultiplicity: "",
            targetMultiplicity: "",
            direction: "forward",
            action: null,
            foreignKeyColumn: null,
          });
        }
      }
    }
    if (classCount >= MAX_CLASSES) break;
  }

  if (arch.nodes.filter((n) => n.kind === "class").length === 0 && arch.nodes.filter((n) => n.kind === "package").length === folders.size) {
    warnings.push("No classes found — the diagram shows only folder packages. Add class definitions to see richer architecture.");
  }

  // Prune edges where target class doesn't exist in repo (dangling extends)
  const known = new Set(arch.nodes.map((n) => n.id));
  arch.relationships = arch.relationships.filter((r) => known.has(r.target));

  return {
    mermaid: architectureToMermaid(arch),
    stats: { files: limited.length, classes: classCount, modules: folders.size },
    warnings,
  };
}
