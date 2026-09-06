"use client";

import { useCallback, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AIChatRequest {
  message: string;
  action: "generate" | "transform" | "explain" | "analyze" | "chat" | "why";
  mermaid?: string;
  selectedNode?: string | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface StreamMeta {
  fallback?: boolean;
  message?: string;
}

interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (full: string) => void;
  onError: (message: string) => void;
  /** Fired synchronously when the server sends its meta frame. */
  onMeta?: (meta: StreamMeta) => void;
}

/**
 * SSE block parser.
 *
 * Frames are `event: <name>\n data: ...lines...\n\n`. Payloads containing
 * newlines arrive as several `data:` lines which the spec says to join
 * with "\n". Content is preserved verbatim (only the single separator
 * space after `data:` is stripped) — trimming here used to corrupt every
 * multi-line delta.
 */
function parseChunk(buffer: string): { events: Array<{ event?: string; data: string }>; rest: string } {
  const events: Array<{ event?: string; data: string }> = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) >= 0) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event: string | undefined;
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const value = line.slice(5);
        dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
      }
    }
    if (event !== undefined || dataLines.length > 0) {
      events.push({ event, data: dataLines.join("\n") });
    }
  }
  return { events, rest };
}

export function useAIChat(): {
  streaming: boolean;
  error: string | null;
  fallback: boolean;
  stream: (request: AIChatRequest, callbacks: StreamCallbacks) => Promise<string>;
} {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (request: AIChatRequest, callbacks: StreamCallbacks): Promise<string> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setError(null);
    setFallback(false);

    const { onDelta, onDone, onError, onMeta } = callbacks;
    let full = "";
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      onDone(full);
    };
    try {
      const fetchBody = {
        message: request.message,
        action: request.action,
        mermaid: request.mermaid,
        selectedNode: request.selectedNode,
        history: request.history,
      };
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fetchBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Error envelope: { ok:false, error:{ code, message, requestId } }.
        const detail = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(detail?.error?.message ?? `Request failed (${response.status})`);
      }
      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseChunk(buffer);
        buffer = rest;
        for (const event of events) {
          if (event.event === "error") {
            throw new Error(event.data || "Stream error");
          }
          if (event.event === "meta" && event.data) {
            try {
              const meta = JSON.parse(event.data) as StreamMeta;
              if (meta.fallback) setFallback(true);
              onMeta?.(meta);
            } catch {
              /* ignore malformed meta */
            }
          }
          if (event.event === "delta" && event.data) {
            full += event.data;
            onDelta(event.data);
          }
          if (event.event === "done") {
            finish();
          }
        }
      }
      // The server always sends `done`; this is a transport-level backstop.
      finish();
      return full;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        finish();
        return full;
      }
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      onError(message);
      return full;
    } finally {
      setStreaming(false);
    }
  }, []);

  return { streaming, error, fallback, stream };
}