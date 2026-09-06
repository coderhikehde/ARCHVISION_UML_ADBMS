import { generateText, streamText } from "ai";
import { AiUnavailableError } from "@/lib/http/api-error";
import type { AiChatRequest, AiDescribeRequest } from "@/lib/validation/schemas/ai.schemas";
import { offlineChat, type ChatSink } from "@/lib/ai/offline-engine";

/**
 * AiAssistService — bounded context: AI generation.
 *
 * Centralizes everything the two AI routes used to duplicate:
 *   - provider selection (OpenAI gpt-4o-mini when OPENAI_API_KEY is set,
 *     otherwise Anthropic claude-3-5-sonnet-latest), with lazy module
 *     loading so unused SDKs are never bundled
 *   - prompt templates (describe + chat per-action system prompts)
 *   - the deterministic offline fallback (lib/ai/offline-engine.ts)
 *
 * Routes stay thin: parse/validate → service → serialize (JSON or SSE).
 */

export interface AiStreamSink extends ChatSink {
  done(): void;
}

function hasProviderKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

let openaiModule: typeof import("@ai-sdk/openai") | null = null;
let anthropicModule: typeof import("@ai-sdk/anthropic") | null = null;

async function getOpenAiModule() {
  if (!openaiModule) openaiModule = await import("@ai-sdk/openai");
  return openaiModule;
}

async function getAnthropicModule() {
  if (!anthropicModule) anthropicModule = await import("@ai-sdk/anthropic");
  return anthropicModule;
}

async function getModel() {
  if (process.env.OPENAI_API_KEY) {
    const { openai } = await getOpenAiModule();
    return openai("gpt-4o-mini");
  }
  const { anthropic } = await getAnthropicModule();
  return anthropic("claude-3-5-sonnet-latest");
}

export class AiAssistService {
  hasProvider(): boolean {
    return hasProviderKey();
  }

  /**
   * Short, non-streaming description (diagram overview or single node).
   * Throws AiUnavailableError when no key is configured or generation
   * fails — routes map that to 502 and the client falls back offline.
   */
  async describe(payload: AiDescribeRequest): Promise<{ text: string }> {
    if (!hasProviderKey()) {
      throw new AiUnavailableError("AI description unavailable — no provider key configured");
    }

    const focus = payload.focus;
    const nodeList = payload.nodes
      .map((n) => `${n.name}${n.kind && n.kind !== "class" ? ` (${n.kind})` : ""} — ${n.attributeCount} attributes, ${n.methodCount} methods`)
      .join("\n");
    const relList = payload.relationships
      .map((r) => `${r.source} ${r.type} ${r.target}${r.label ? ` : ${r.label}` : ""}`)
      .join("\n");
    const issueList = payload.issues.map((i) => `[${i.severity}] ${i.message}`).join("\n");

    const system = focus
      ? "You are ArchVision, a UML design assistant. Describe ONLY the requested node of the provided model, in 2-4 concise sentences of Markdown. Base everything strictly on the provided model facts. Do not invent members or relationships."
      : "You are ArchVision, a UML design assistant. Produce a concise Markdown overview (3-6 sentences) of the provided model: responsibilities, layering, and notable design observations. Base everything strictly on the provided model facts. Do not invent members or relationships.";

    const prompt = [
      `Model: "${payload.title}" (${payload.diagramType} diagram)`,
      "",
      "Nodes:",
      nodeList || "(none)",
      "",
      "Relationships:",
      relList || "(none)",
      ...(issueList ? ["", "Validation findings:", issueList] : []),
      ...(focus ? [``, `Describe this node in particular: ${focus}`] : []),
    ].join("\n");

    const { text } = await generateText({
      model: await getModel(),
      system,
      prompt,
      temperature: 0.3,
    });

    const trimmed = text.trim();
    if (!trimmed) {
      throw new AiUnavailableError("Empty description generated");
    }
    return { text: trimmed };
  }

  /**
   * Stream a chat response. Emits the offline marker + deterministic
   * content when no provider key is configured; otherwise streams the
   * provider's deltas. Always writes the final "done" event.
   */
  async streamChat(input: AiChatRequest, sink: AiStreamSink): Promise<"online" | "offline"> {
    if (!hasProviderKey()) {
      await offlineChat(input, sink);
      sink.done();
      return "offline";
    }

    const system =
      input.action === "transform"
        ? "You are ArchVision, a UML design assistant. Apply the user's requested change to the provided Mermaid diagram. Output ONLY the complete modified Mermaid code. Do not explain. Preserve all unchanged classes and relations verbatim. If the diagram is an erDiagram or sequenceDiagram, preserve its header and syntax."
        : input.action === "generate"
          ? "You are ArchVision, an expert UML modeler. Convert the user's description into a Mermaid diagram. Output ONLY valid Mermaid classDiagram code, never explanations. Use typed members and precise cardinality."
          : input.action === "explain"
            ? "You are an expert software architect. Produce a concise Markdown design document for the provided diagram: overview, node inventory table, relationships, design patterns, and data flow."
            : input.action === "analyze"
              ? "You are an architecture critic. In Markdown, evaluate the diagram for coupling, cohesion, god classes, missing abstraction layers, naming, cycles and data issues. Include severity ratings and concrete refactorings."
              : "You are ArchVision's design copilot inside a UML editor. Answer briefly (max 4 sentences) and reference the current diagram.";

    const messages = [
      ...(input.history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      {
        role: "user" as const,
        content:
          input.action === "generate"
            ? input.message
            : `Current diagram:\n\`\`\`mermaid\n${input.mermaid ?? "(empty)"}\n\`\`\`\n\n${input.message}`,
      },
    ];

    const result = streamText({
      model: await getModel(),
      system,
      messages,
      temperature: input.action === "transform" ? 0.1 : 0.4,
    });

    const reader = result.textStream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) sink.write("delta", value);
    }
    sink.done();
    return "online";
  }
}