/**
 * Server-Sent Events framing helper (used by the streaming AI chat route).
 * Transport concern only — the business logic lives in AiAssistService.
 *
 * Framing follows the SSE spec: a payload containing newlines is emitted
 * as multiple `data:` lines, which conforming clients join back with "\n".
 */

export interface SseWriter {
  write(event: string, data: string): void;
  end(): void;
}

export interface StreamSseOptions {
  /** Aborting closes the stream promptly when the client disconnects. */
  signal?: AbortSignal;
}

const encoder = new TextEncoder();

export function streamSse(
  producer: (writer: SseWriter) => Promise<void>,
  options: StreamSseOptions = {}
): Response {
  let closed = false;

  const close = (controller: ReadableStreamDefaultController<Uint8Array>): void => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // already closed by the consumer or an earlier close
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer: SseWriter = {
        write: (event, data) => {
          if (closed) return; // client went away mid-stream — drop silently
          const dataLines = data.split("\n").map((line) => `data: ${line}`);
          try {
            controller.enqueue(encoder.encode(`event: ${event}\n${dataLines.join("\n")}\n\n`));
          } catch {
            closed = true; // enqueue after cancel — stop producing
          }
        },
        end: () => close(controller),
      };
      const onAbort = (): void => close(controller);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await producer(writer);
      } catch (error) {
        writer.write("error", error instanceof Error ? error.message : "Unexpected error");
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
        close(controller);
      }
    },
    cancel() {
      // Consumer disconnected — producer writes become no-ops.
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}