import { test } from "node:test";
import assert from "node:assert/strict";
import { importGitHubRepo, GitHubImportError } from "@/lib/importers/github";
import { parseArchitectureDiagram } from "@/lib/architecture/parse";

test("extracts TypeScript classes with extends/implements and folder grouping", () => {
  const result = importGitHubRepo([
    { path: "src/auth/jwt.ts", content: "export class JWTController extends BaseController implements Authenticatable {}\nexport interface TokenStore extends Store {}" },
    { path: "src/auth/store.ts", content: "export class BaseController {}\nclass Store {}" },
    { path: "src/payment/processor.ts", content: "class PaymentProcessor extends BaseController {}" },
  ]);
  assert.equal(result.stats.files, 3);
  assert.ok(result.stats.classes >= 5);
  assert.ok(result.stats.modules >= 2);
  const parsed = parseArchitectureDiagram(result.mermaid);
  assert.equal(parsed.error, null);
  // Folder containers become packages
  assert.ok(parsed.architecture.nodes.some((n) => n.name === "auth" && n.kind === "package"));
  // Inheritance edges
  assert.ok(parsed.architecture.relationships.some((r) => r.source === "JWTController" && r.type === "inheritance"));
});

test("extracts Python classes and handles empty folder case", () => {
  const result = importGitHubRepo([
    { path: "app/models.py", content: "class User:\n    pass\n\nclass Admin(User):\n    pass\n" },
    { path: "README.md", content: "# readme" },
  ]);
  assert.equal(result.stats.files, 1); // only .py counts
  const parsed = parseArchitectureDiagram(result.mermaid);
  assert.ok(parsed.architecture.nodes.some((n) => n.name === "Admin"));
  assert.ok(parsed.architecture.relationships.some((r) => r.source === "Admin" && r.target === "User"));
});

test("caps at MAX_FILES and MAX_CLASSES with warnings", () => {
  const manyFiles = Array.from({ length: 250 }, (_, i) => ({ path: `src/file${i}.ts`, content: `class Foo${i} {}` }));
  const result = importGitHubRepo(manyFiles);
  assert.ok(result.warnings.some((w) => w.includes("Scanned 200")));
});

test("rejects empty or non-source repos", () => {
  assert.throws(() => importGitHubRepo([]), GitHubImportError);
  assert.throws(() => importGitHubRepo([{ path: "README.md", content: "hi" }]), GitHubImportError);
});

test("mermaid output round-trips", () => {
  const result = importGitHubRepo([{ path: "a.ts", content: "class A {}\nclass B extends A {}" }]);
  const first = parseArchitectureDiagram(result.mermaid);
  assert.equal(first.error, null);
  const second = parseArchitectureDiagram(result.mermaid);
  assert.equal(second.error, null);
  assert.deepEqual(
    first.architecture.nodes.map((n) => n.name).sort(),
    second.architecture.nodes.map((n) => n.name).sort()
  );
});
