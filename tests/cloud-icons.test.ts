import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOUD_SERVICES,
  PROVIDER_LABELS,
  serviceIconForStereotype,
} from "@/lib/architecture/cloud-icons";
import { parseArchitectureDiagram } from "@/lib/architecture/parse";
import { architectureToMermaid } from "@/lib/architecture/serialization";
import { updateArchitectureNode } from "@/lib/architecture/editing";
import type { CloudProvider } from "@/lib/architecture/cloud-icons";

/**
 * Epic 1 (cloud icon library) contract tests.
 *
 * The feature rides on the existing <<stereotype>> channel, so the
 * critical guarantees are:
 *   1. the catalog itself is well-formed
 *   2. stereotype → icon resolution handles ids + aliases + junk
 *   3. assigning a service survives parse → serialize → parse unchanged
 *   4. free-text stereotypes still round-trip and resolve to NO icon
 */

const VALID_PROVIDERS = new Set(Object.keys(PROVIDER_LABELS) as CloudProvider[]);

test("cloud service catalog is well-formed", () => {
  const ids = new Set<string>();
  for (const service of CLOUD_SERVICES) {
    assert.ok(service.id.length > 0, "id must be non-empty");
    assert.ok(!ids.has(service.id), `duplicate catalog id: ${service.id}`);
    ids.add(service.id);
    assert.ok(/^[a-z0-9-]+$/.test(service.id), `id must be mermaid-safe: ${service.id}`);
    assert.ok(service.label.length > 0);
    assert.ok(VALID_PROVIDERS.has(service.provider), `unknown provider: ${service.provider}`);
    assert.ok(/^#[0-9A-Fa-f]{6}$/.test(service.color), `color must be hex: ${service.color}`);
    // lucide-react icons are forwardRef components — functions or React
    // element objects ($$typeof), never plain strings/numbers.
    const icon = service.icon as unknown;
    assert.ok(
      typeof icon === "function" || (typeof icon === "object" && icon !== null),
      "icon must be a renderable component"
    );
  }
  assert.ok(CLOUD_SERVICES.length >= 11, "catalog covers AWS/GCP/Azure/K8s/Docker/Kafka/Redis");
});

test("serviceIconForStereotype resolves ids, aliases, case and decorations", () => {
  assert.equal(serviceIconForStereotype("aws-lambda")?.id, "aws-lambda");
  assert.equal(serviceIconForStereotype("Lambda")?.id, "aws-lambda");
  assert.equal(serviceIconForStereotype("  LAMBDA ")?.id, "aws-lambda");
  assert.equal(serviceIconForStereotype("s3")?.id, "aws-s3");
  assert.equal(serviceIconForStereotype("k8s")?.id, "kubernetes");
  assert.equal(serviceIconForStereotype("bq")?.id, "gcp-bigquery");
  assert.equal(serviceIconForStereotype("cache")?.id, "redis");
  // Unknown / free-text stereotypes resolve to NO icon.
  assert.equal(serviceIconForStereotype("entity"), null);
  assert.equal(serviceIconForStereotype(""), null);
  assert.equal(serviceIconForStereotype(null), null);
  assert.equal(serviceIconForStereotype(undefined), null);
});

const MERMAID_WITH_SERVICE = [
  "classDiagram",
  "class PaymentService {",
  "  +charge(amount: decimal) bool",
  "}",
  "class Payments <<aws-lambda>>",
  "PaymentService ..> Payments : invokes",
].join("\n");

test("service stereotypes survive a full Mermaid round trip", () => {
  const first = parseArchitectureDiagram(MERMAID_WITH_SERVICE);
  assert.equal(first.error, null);
  const payments = first.architecture.nodes.find((n) => n.name === "Payments");
  assert.ok(payments, "node with annotation must parse");
  assert.equal(payments.stereotype, "aws-lambda");

  const serialized = architectureToMermaid(first.architecture);
  assert.ok(serialized.includes("<<aws-lambda>>"), "serializer re-emits the annotation");

  const second = parseArchitectureDiagram(serialized);
  assert.equal(second.error, null);
  const again = second.architecture.nodes.find((n) => n.name === "Payments");
  assert.equal(again?.stereotype, "aws-lambda");
});

test("assigning an icon via updateNode edits the stereotype and clears it back", () => {
  const parsed = parseArchitectureDiagram(MERMAID_WITH_SERVICE);
  const arch = parsed.architecture;
  const target = arch.nodes.find((n) => n.name === "PaymentService");
  assert.ok(target);

  const withIcon = updateArchitectureNode(arch, target.id, { stereotype: "docker" });
  const updated = withIcon.arch.nodes.find((n) => n.name === "PaymentService");
  assert.equal(updated?.stereotype, "docker");
  assert.equal(serviceIconForStereotype(updated?.stereotype)?.provider, "docker");

  const cleared = updateArchitectureNode(withIcon.arch, target.id, { stereotype: null });
  const clearedNode = cleared.arch.nodes.find((n) => n.name === "PaymentService");
  assert.equal(clearedNode?.stereotype, null);
});

test("free-text stereotypes keep working and render without a service chip", () => {
  const code = ["classDiagram", "class Repo <<repository>>"].join("\n");
  const parsed = parseArchitectureDiagram(code);
  const repo = parsed.architecture.nodes.find((n) => n.name === "Repo");
  assert.equal(repo?.stereotype, "repository");
  assert.equal(serviceIconForStereotype(repo?.stereotype), null);
});