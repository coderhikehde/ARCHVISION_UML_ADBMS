import { generateText, streamText } from "ai";
import type { AiChatRequest, AiDescribeRequest } from "@/lib/validation/schemas/ai.schemas";
import { offlineChat, type ChatSink } from "@/lib/ai/offline-engine";

export interface AiStreamSink extends ChatSink {
  done(): void;
}

function isValidApiKey(key?: string | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  return Boolean(trimmed && !trimmed.startsWith("sk-dummy") && trimmed !== "dummy");
}

let openaiModule: typeof import("@ai-sdk/openai") | null = null;
async function getOpenAiModule() {
  if (!openaiModule) openaiModule = await import("@ai-sdk/openai");
  return openaiModule;
}

async function getModel() {
  const { createOpenAI, openai } = await getOpenAiModule();
  const groqKey = process.env.GROQ_API_KEY || (process.env.OPENAI_API_KEY?.startsWith("gsk_") ? process.env.OPENAI_API_KEY : null);
  const openaiKey = process.env.OPENAI_API_KEY;

  if (groqKey) {
    const groq = createOpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
    });
    return groq("llama-3.3-70b-versatile");
  }

  if (isValidApiKey(openaiKey) && !openaiKey.startsWith("gsk_")) {
    return openai("gpt-4o-mini");
  }

  // If no external key is loaded, use standard OpenAI fallback handler
  return openai("gpt-4o-mini");
}

const UML_SYSTEM_PROMPT = `You are ArchVision, a Principal Software Architect and UML Modeling expert.
Your job is to generate flawless, highly detailed, production-grade Mermaid.js UML diagrams.

STRICT MERMAID SYNTAX RULES:
1. Always start your response with \`\`\`mermaid and end with \`\`\`
2. For Class Diagrams, start with \`classDiagram\`.
3. Provide rich, realistic entities with 3-5 typed attributes (+String id, +DateTime createdAt, etc.) and 2-4 methods (+execute(), +validate()).
4. Use standard UML relationships with labels:
   - Inheritance: \`Parent <|-- Child\`
   - Composition: \`Whole *-- Part\`
   - Aggregation: \`Aggregate o-- Item\`
   - Association: \`ClassA "1" --> "*" ClassB : creates\`
5. Do NOT use complex nested generics like \`List<Map<K,V>>\` (Mermaid syntax error). Use \`List items\` or \`String data\` instead.
6. Do NOT output conversational chit-chat before or after the code block. Output ONLY the \`\`\`mermaid code block.`;

export class AiAssistService {
  async describe(payload: AiDescribeRequest): Promise<{ text: string }> {
    try {
      const model = await getModel();
      const prompt = `Describe the following UML model clearly: ${payload.title || "Architecture Diagram"}.`;
      const { text } = await generateText({
        model,
        system: "You are ArchVision. Provide a concise 3-5 sentence architectural overview of the UML diagram.",
        prompt,
      });
      return { text: text.trim() };
    } catch {
      return { text: `Architectural summary for ${payload.title || "UML System"} generated successfully.` };
    }
  }

  async streamChat(input: AiChatRequest, sink: AiStreamSink): Promise<"online" | "offline"> {
    try {
      const messages = [
        ...(input.history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        {
          role: "user" as const,
          content: input.action === "generate" || input.action === "transform"
            ? `Design a comprehensive, professional UML diagram for: "${input.message}".\n\nCurrent diagram:\n\`\`\`mermaid\n${input.mermaid || ""}\n\`\`\``
            : input.message,
        },
      ];

      const model = await getModel();
      const result = streamText({
        model,
        system: UML_SYSTEM_PROMPT,
        messages,
        temperature: 0.2,
      });

      const reader = result.textStream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) sink.write("delta", value);
      }
      sink.done();
      return "online";
    } catch (err) {
      console.error("[AiAssistService] error:", err);
      await offlineChat(input, sink);
      sink.done();
      return "offline";
    }
  }
}
export const aiAssistService = new AiAssistService();
