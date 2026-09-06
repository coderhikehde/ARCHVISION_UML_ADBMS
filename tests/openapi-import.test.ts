import { test } from "node:test";
import assert from "node:assert/strict";
import { importOpenApi, OpenApiImportError, sanitizeIdentifier } from "@/lib/importers/openapi";
import { parseArchitectureDiagram } from "@/lib/architecture/parse";
import { architectureToMermaid } from "@/lib/architecture/serialization";

/**
 * Epic 4 (OpenAPI importer) contract tests.
 *
 * The critical guarantee: generated Mermaid must parse cleanly through the
 * SAME pipeline as hand-written diagrams (parse -> serialize -> parse),
 * because it feeds the editor, validator and exporter directly.
 */

const PETSTORE_LITE = {
  openapi: "3.0.3",
  info: { title: "Petstore Lite", version: "1.0.0" },
  paths: {
    "/pets": {
      get: { tags: ["pets"], summary: "List pets", responses: { "200": { content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } } } } } } },
      post: {
        tags: ["pets"],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/PetInput" } } } },
        responses: { "201": { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } },
      },
    },
    "/pets/{petId}": {
      get: { tags: ["pets"], responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } } },
      delete: { tags: ["pets"], responses: { "204": {} } },
    },
    "/orders": {
      post: {
        tags: ["orders"],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } },
        responses: { "201": { content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } } },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: { id: { type: "integer" }, name: { type: "string" }, tag: { type: "string" } },
      },
      PetInput: { type: "object", properties: { name: { type: "string" } } },
      Order: { type: "object", properties: { id: { type: "integer" }, petId: { type: "integer" } } },
      Dog: { allOf: [{ $ref: "#/components/schemas/Pet" }, { type: "object", properties: { breed: { type: "string" } } }] },
    },
  },
};

test("imports operations into grouped component + sequence diagrams", () => {
  const result = importOpenApi(PETSTORE_LITE);
  assert.equal(result.stats.operations, 5); // 2x list/create pets, get/delete pet, create order
  assert.equal(result.stats.schemas, 4);
  assert.equal(result.stats.groups, 2); // pets, orders
  assert.deepEqual(result.warnings, []);
  assert.ok(result.classMermaid.startsWith("classDiagram"));
  assert.ok(result.sequenceMermaid.startsWith("sequenceDiagram"));
});

test("generated class diagram round-trips through the canonical parser", () => {
  const result = importOpenApi(PETSTORE_LITE);
  const first = parseArchitectureDiagram(result.classMermaid);
  assert.equal(first.error, null);

  // Groups became namespaces with an API facade class inside.
  const petsApi = first.architecture.nodes.find((n) => n.name === "PetsAPI");
  assert.ok(petsApi, "PetsAPI facade exists");
  assert.equal(petsApi.parentId, "pets");

  // Schema classes carry properties; required ones unmarked, optionals get "?".
  const pet = first.architecture.nodes.find((n) => n.name === "Pet");
  assert.ok(pet);
  assert.ok(pet.attributes.some((a) => a.name === "id"));
  assert.ok(!pet.attributes.some((a) => a.name === "id?"), "required props stay unmarked");
  assert.ok(pet.attributes.some((a) => a.name === "tag?"), "optional props are marked");

  // Request/response edges reference real schemas.
  assert.ok(
    first.architecture.relationships.some((r) => r.target === "PetInput" && r.type === "dependency"),
    "requestBody creates a dependency"
  );
  assert.ok(
    first.architecture.relationships.some((r) => r.source === "OrdersAPI" && r.target === "Order"),
    "success response creates an association"
  );

  // allOf composition becomes inheritance.
  assert.ok(first.architecture.relationships.some((r) => r.source === "Dog" && r.type === "inheritance"));

  // Second pass stays stable (serialize -> parse again).
  const second = parseArchitectureDiagram(architectureToMermaid(first.architecture));
  assert.equal(second.error, null);
});

test("sequence diagram covers every operation with request/response pairs", () => {
  const result = importOpenApi(PETSTORE_LITE);
  const lines = result.sequenceMermaid.split("\n");
  assert.ok(lines.some((l) => l.includes("participant \"pets\" as pets")));
  assert.ok(lines.some((l) => l.includes("Client->>pets: GET /pets")));
  assert.ok(lines.some((l) => l.includes("Client->>pets: DELETE /pets/{petId}")));
  assert.ok(lines.filter((l) => l.includes("-->>Client")).length >= 3);
});

test("accepts YAML and JSON strings as well as objects", () => {
  const yaml = [
    "openapi: 3.1.0",
    "info:",
    "  title: Tiny API",
    "paths:",
    "  /ping:",
    "    get:",
    "      responses:",
    "        '200': {}",
  ].join("\n");
  const fromYaml = importOpenApi(yaml);
  assert.equal(fromYaml.stats.operations, 1);
  const fromJson = importOpenApi(JSON.stringify(PETSTORE_LITE));
  assert.equal(fromJson.stats.operations, 5);
});

test("rejects non-OpenAPI input with actionable errors", () => {
  assert.throws(() => importOpenApi(""), OpenApiImportError);
  assert.throws(() => importOpenApi("{ not json or yaml !!!"), OpenApiImportError);
  assert.throws(() => importOpenApi({ hello: "world" }), OpenApiImportError);
  assert.throws(() => importOpenApi([1, 2, 3]), OpenApiImportError);
});

test("empty specs degrade gracefully instead of throwing", () => {
  const empty = importOpenApi({ openapi: "3.1.0", info: { title: "Empty" }, paths: {} });
  assert.equal(empty.stats.operations, 0);
  assert.ok(empty.warnings.length > 0, "warns that there is nothing to import");
});

test("sanitizeIdentifier produces mermaid-safe names", () => {
  assert.equal(sanitizeIdentifier("pet-store"), "petstore");
  assert.equal(sanitizeIdentifier("2fa"), "_2fa");
  assert.equal(sanitizeIdentifier("///"), "X");
});
