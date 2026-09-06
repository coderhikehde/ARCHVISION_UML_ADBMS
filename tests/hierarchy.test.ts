import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ancestorChain,
  canDrillInto,
  childrenOf,
  descendantsOf,
  focusArchitecture,
} from "@/lib/architecture/hierarchy";
import { parseArchitectureDiagram } from "@/lib/architecture/parse";
import { architectureToMermaid } from "@/lib/architecture/serialization";
import { updateArchitectureNode } from "@/lib/architecture/editing";
import type { Architecture, ArchitectureNode } from "@/types/diagram";

/**
 * Epic 2 (C4 hierarchy) contract tests.
 *
 * Containment rides Mermaid `namespace` blocks. The guarantees:
 *   1. parser attaches parentId + materializes implicit container nodes
 *   2. serializer re-emits namespaces; full round trip is lossless
 *   3. focus/drill helpers filter nodes+edges without mutating
 *   4. reparenting rejects self-containment
 */

const NAMESPACED = [
  "classDiagram",
  "namespace Auth Service {",
  "  class JWTController {",
  "    +verify(token: string) bool",
  "  }",
  "  class TokenStore {",
  "    -secrets Map",
  "  }",
  "}",
  "namespace Payments {",
  "  class Ledger {",
  "    +balance() decimal",
  "  }",
  "}",
  "class ApiGateway {",
  "  +route()",
  "}",
  "ApiGateway --> JWTController : calls",
].join("\n");

function node(arch: Architecture, name: string): ArchitectureNode {
  const found = arch.nodes.find((n) => n.name === name);
  assert.ok(found, `node ${name} must exist`);
  return found;
}

test("parser attaches containment and materializes implicit containers", () => {
  const { architecture, error } = parseArchitectureDiagram(NAMESPACED);
  assert.equal(error, null);

  assert.equal(node(architecture, "JWTController").parentId, "Auth Service");
  assert.equal(node(architecture, "TokenStore").parentId, "Auth Service");
  assert.equal(node(architecture, "Ledger").parentId, "Payments");
  assert.equal(node(architecture, "ApiGateway").parentId, null);

  // The namespaces exist as drillable container nodes even though they had
  // no explicit class declaration.
  const auth = node(architecture, "Auth Service");
  assert.equal(auth.parentId, null);
  assert.equal(childrenOf(architecture, "Auth Service").length, 2);
});

test("serializer re-emits namespace blocks and round-trips losslessly", () => {
  const first = parseArchitectureDiagram(NAMESPACED).architecture;
  const code = architectureToMermaid(first);
  assert.ok(code.includes("namespace Auth Service {"), "container emitted as namespace");
  assert.ok(code.includes("namespace Payments {"));

  const second = parseArchitectureDiagram(code);
  assert.equal(second.error, null);
  for (const original of first.nodes) {
    const again = node(second.architecture, original.name);
    assert.equal(again.parentId, original.parentId, `${original.name} keeps its parent`);
    assert.equal(again.stereotype, original.stereotype);
  }
});

test("flat diagrams are unaffected (parentId everywhere null)", () => {
  const flat = ["classDiagram", "class A", "class B", "A --> B"].join("\n");
  const { architecture, error } = parseArchitectureDiagram(flat);
  assert.equal(error, null);
  for (const n of architecture.nodes) assert.equal(n.parentId, null);
  assert.ok(!architectureToMermaid(architecture).includes("namespace"));
});

test("drill helpers: descendants, gate, breadcrumb chain", () => {
  const arch = parseArchitectureDiagram(NAMESPACED).architecture;

  assert.deepEqual(
    descendantsOf(arch, "Auth Service").map((n) => n.name).sort(),
    ["JWTController", "TokenStore"]
  );
  assert.equal(descendantsOf(arch, "ApiGateway").length, 0);
  assert.ok(canDrillInto(arch, "Payments"));
  assert.ok(!canDrillInto(arch, "Ledger"), "leaves are not drillable");

  const chain = ancestorChain(arch, "JWTController");
  assert.deepEqual(chain.map((n) => n.name), ["Auth Service", "JWTController"]);
  assert.equal(ancestorChain(arch, "ApiGateway").length, 1);
});

test("focusArchitecture shows the subtree and only internal edges", () => {
  const arch = parseArchitectureDiagram(NAMESPACED).architecture;
  const focused = focusArchitecture(arch, "Auth Service");

  assert.deepEqual(focused.nodes.map((n) => n.name).sort(), ["Auth Service", "JWTController", "TokenStore"]);
  // The ApiGateway --> JWTController edge crosses the boundary and drops out.
  assert.ok(focused.relationships.every((r) => r.source !== "ApiGateway" && r.target !== "ApiGateway"));

  // Null focus = identity (same reference, zero cost).
  assert.equal(focusArchitecture(arch, null), arch);

  // Unknown focus = safe no-op.
  assert.equal(focusArchitecture(arch, "missing").nodes.length, arch.nodes.length);
});

test("reparenting via updateNode guards against cycles and ghosts", () => {
  const arch = parseArchitectureDiagram(NAMESPACED).architecture;
  const gatewayId = node(arch, "ApiGateway").id;
  const authId = node(arch, "Auth Service").id;
  const jwtId = node(arch, "JWTController").id;

  // Move into a real container.
  const moved = updateArchitectureNode(arch, gatewayId, { parentId: authId });
  assert.equal(node(moved.arch, "ApiGateway").parentId, "Auth Service");

  // Self-containment rejected → top level.
  const self = updateArchitectureNode(moved.arch, gatewayId, { parentId: gatewayId });
  assert.equal(node(self.arch, "ApiGateway").parentId, null);

  // Ghost parent rejected.
  const ghost = updateArchitectureNode(self.arch, gatewayId, { parentId: "no-such-node" });
  assert.equal(node(ghost.arch, "ApiGateway").parentId, null);

  // Clearing works.
  const cleared = updateArchitectureNode(ghost.arch, jwtId, { parentId: null });
  assert.equal(node(cleared.arch, "JWTController").parentId, null);
});