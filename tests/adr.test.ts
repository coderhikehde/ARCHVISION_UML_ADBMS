import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adrFromMarkdown,
  adrsToMarkdownBundle,
  adrToMarkdown,
  type AdrRecord,
} from "@/lib/architecture/adr";

/**
 * Epic 6 (ADR system) contract tests.
 * The markdown is the portability contract: serialize -> parse -> serialize
 * must be stable, and foreign/loose files must parse without throwing.
 */

function sample(overrides: Partial<AdrRecord> = {}): AdrRecord {
  return {
    id: "adr_test",
    number: 3,
    title: "Use JWT for stateless authentication",
    status: "accepted",
    context: "Sessions must survive horizontal scaling without sticky routing.",
    decision: "Issue short-lived JWTs signed with a rotating key.",
    consequences: "* Stateless verification\n* Revocation needs a denylist",
    date: "2026-08-21T00:00:00.000Z",
    linkedNodes: ["JWTController", "TokenStore"],
    ...overrides,
  };
}

test("serialize -> parse -> serialize is byte-stable", () => {
  const adr = sample();
  const first = adrToMarkdown(adr);
  const parsed = adrFromMarkdown(first, "adr_parsed");
  assert.ok(parsed);
  assert.equal(parsed.number, 3);
  assert.equal(parsed.title, "Use JWT for stateless authentication");
  assert.equal(parsed.status, "accepted");
  assert.equal(parsed.context.includes("horizontal scaling"), true);
  assert.deepEqual(parsed.linkedNodes, ["JWTController", "TokenStore"]);
  assert.equal(parsed.date.slice(0, 10), "2026-08-21");
  const second = adrToMarkdown({ ...parsed, id: adr.id });
  assert.equal(second, first);
});

test("markdown follows the Nygard section order", () => {
  const md = adrToMarkdown(sample());
  const positions = ["## Status", "## Context", "## Decision", "## Consequences"].map((h) => md.indexOf(h));
  assert.deepEqual(
    positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1])),
    true
  );
});

test("unknown statuses fall back to proposed; missing sections become empty", () => {
  const loose = [
    "# 7. Something we did",
    "",
    "## Status",
    "",
    "Banned probably",
    "",
    "## Decision",
    "",
    "We did the thing.",
  ].join("\n");
  const parsed = adrFromMarkdown(loose, "adr_loose");
  assert.ok(parsed);
  assert.equal(parsed.status, "proposed");
  assert.equal(parsed.decision, "We did the thing.");
  assert.equal(parsed.context, "");
  assert.deepEqual(parsed.linkedNodes, []);
});

test("files without any heading are rejected cleanly", () => {
  assert.equal(adrFromMarkdown("just some text\nno headings here", "x"), null);
});

test("bundle export sorts by number and separates with rules", () => {
  const bundle = adrsToMarkdownBundle([sample({ number: 3 }), sample({ number: 1, title: "First" })]);
  const firstIdx = bundle.indexOf("# 1. First");
  const secondIdx = bundle.indexOf("# 3. Use JWT");
  assert.ok(firstIdx >= 0 && secondIdx > firstIdx, "records ordered by number");
  assert.ok(bundle.includes("---"), "horizontal rule between records");
});
