import { test } from "node:test";
import assert from "node:assert/strict";
import { streamSse } from "@/lib/http/sse";

/**
 * Wire-contract tests for the SSE framing helper.
 *
 * Multi-line payloads MUST survive the round trip: the server emits one
 * `data:` line per source line (spec), and clients join them back with
 * "\n". This regression-tests the bug where streamed mermaid/markdown
 * deltas lost every newline.
 */

async function collect(response: Response): Promise<string> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

test("streamSse frames multi-line payloads as multiple data lines", async () => {
  const response = streamSse(async (writer) => {
    writer.write("delta", "line1\nline2\n");
    writer.write("done", "ok");
  });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const raw = await collect(response);
  assert.equal(raw, "event: delta\ndata: line1\ndata: line2\ndata: \n\nevent: done\ndata: ok\n\n");
});

test("parsed blocks rejoin into the original payload (client contract)", async () => {
  // Mirrors hooks/useAIChat.parseChunk: data lines join with "\n".
  const response = streamSse(async (writer) => {
    writer.write("delta", "classDiagram\nclass User {\n  +name: string\n}");
  });
  const raw = await collect(response);
  const block = raw.trimEnd().split("\n\n").pop() ?? "";
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) {
      const v = line.slice(5);
      dataLines.push(v.startsWith(" ") ? v.slice(1) : v);
    }
  }
  assert.equal(event, "delta");
  assert.equal(dataLines.join("\n"), "classDiagram\nclass User {\n  +name: string\n}");
});

test("streamSse emits an error frame when the producer throws and still closes", async () => {
  const response = streamSse(async () => {
    throw new Error("boom");
  });
  const raw = await collect(response);
  assert.ok(raw.includes("event: error"), "must emit an error frame");
  assert.ok(raw.includes("data: boom"));
});

test("streamSse drops writes after the caller aborts", async () => {
  const controller = new AbortController();
  const response = streamSse(
    async (writer) => {
      writer.write("delta", "before");
      controller.abort();
      writer.write("delta", "after"); // must be dropped
    },
    { signal: controller.signal }
  );
  const raw = await collect(response);
  assert.ok(raw.includes("data: before"));
  assert.ok(!raw.includes("after"));
});