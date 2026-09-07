"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  FileText,
  ScanSearch,
  Sparkles,
  Wand2,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/shared/markdown";
import { useAIChat, type ChatMessage } from "@/hooks/useAIChat";
import type { DiagramEngine } from "@/hooks/useDiagram";
import { storage } from "@/lib/data/storage";
import { generateId } from "@/lib/utils";

export type AiMode = "openai" | "anthropic" | "offline";

interface AISidebarProps {
  engine: DiagramEngine;
  open: boolean;
  onClose: () => void;
  mode: AiMode;
}

const SUGGESTIONS = [
  { label: "Create / Replace Diagram", action: "generate", icon: Sparkles },
  { label: "Analyze Architecture", action: "analyze", icon: ScanSearch },
  { label: "Generate Design Docs", action: "explain", icon: FileText },
  { label: "Convert to Sequence", action: "transform", icon: Wand2 },
] as const;

type SuggestionAction = (typeof SUGGESTIONS)[number]["action"] | "why" | "chat";
type Suggestion = (typeof SUGGESTIONS)[number];

function extractMermaid(text: string): string | null {
  const match = text.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  const clean = text.trim();
  if (
    clean.startsWith("classDiagram") ||
    clean.startsWith("sequenceDiagram") ||
    clean.startsWith("erDiagram") ||
    clean.startsWith("flowchart") ||
    clean.startsWith("graph") ||
    clean.startsWith("stateDiagram")
  ) {
    return clean;
  }
  return null;
}

export function AISidebar({ engine, open, onClose, mode }: AISidebarProps): React.ReactElement | null {
  const { streaming, error, fallback, stream } = useAIChat();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>(() => [...SUGGESTIONS]);
  const [appliedId, setAppliedId] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const arch = engine.architecture;
    if (messages.length === 0) {
      const modeLine = "Llama 3.3 70B Engine Active";
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Hi! I'm your ArchVision design copilot. **${modeLine}**.\n\nTell me what diagram to build (e.g. *"Create a Hospital Management System with Patient, Doctor, and Billing"*), or ask me to edit the current design.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [open, engine.architecture, engine.name, messages.length, mode]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const runStream = async (action: SuggestionAction, message: string): Promise<void> => {
    const userMessage: ChatMessage = {
      id: generateId("msg"),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: ChatMessage = {
      id: generateId("msg"),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    const fallbackRef = { current: false };
    const full = await stream(
      {
        message,
        action: action as "generate" | "transform" | "explain" | "analyze" | "chat" | "why",
        mermaid: engine.mermaidCode,
        selectedNode: engine.selectedNodeId,
        history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      },
      {
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: m.content + delta } : m))
          );
        },
        onMeta: (meta) => {
          if (meta.fallback) fallbackRef.current = true;
        },
        onDone: (fullText) => {
          const diagramCode = extractMermaid(fullText);
          if (diagramCode) {
            engine.applyDiagram(diagramCode);
            setAppliedId(assistantMessage.id);
          }
          storage
            .recordPrompt({
              diagramId: engine.diagramId,
              prompt: message,
              response: fullText,
              actionType: action === "explain" ? "explain" : action === "analyze" ? "analyze" : action === "transform" ? "transform" : "generate",
            })
            .catch((err) => console.warn("[ai-sidebar] prompt history not saved", err));
        },
        onError: (errorMessage) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? {
                    ...m,
                    content: fallbackRef.current
                      ? "Offline mode — local engine active."
                      : `⚠️ ${errorMessage}`,
                  }
                : m
            )
          );
        },
      }
    );

    if (full.trim().length === 0) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
    }
  };

  const handleSend = (): void => {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    
    // Automatically infer action from input
    let action: SuggestionAction = "generate";
    if (/^why(\s|$)/i.test(message)) action = "why";
    else if (/^(explain|describe|doc)/i.test(message)) action = "explain";
    else if (/^(analyze|review|check)/i.test(message)) action = "analyze";
    else if (/^(transform|convert|change to)/i.test(message)) action = "transform";
    else action = "generate";

    void runStream(action, message);
  };

  const handleSuggestion = (action: SuggestionAction): void => {
    if (streaming) return;
    const message =
      action === "analyze"
        ? "Run a full architecture analysis on the current diagram"
        : action === "explain"
          ? "Generate a design document for the current diagram"
          : action === "transform"
            ? "Convert this diagram to a sequence diagram"
            : `Add a new class to the current diagram${engine.selectedNodeId ? ` connected to ${engine.selectedNodeId}` : ""}`;
    void runStream(action, message);
  };

  if (!open) return null;

  return (
    <motion.aside
      initial={{ x: 28, opacity: 0 }}
      animate={{ x: 0, 1: 1 }}
      exit={{ x: 28, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
      className="glass relative flex h-full w-[420px] shrink-0 flex-col border-l border-line"
      aria-label="AI assistant"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white shadow-btn-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold tracking-tight text-foreground">AI Design Copilot</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {streaming ? "generating…" : "ready"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-foreground"
          aria-label="Close AI assistant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {engine.selectedNodeId ? (
        <div className="border-b border-accent-200/60 bg-accent-soft/50 px-5 py-2 text-[12px] text-teal-900">
          <span className="font-bold">Node selected:</span> {engine.selectedNodeId}
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const diagramCode = message.role === "assistant" ? extractMermaid(message.content) : null;
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, scale: 0.97, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className={cn("flex flex-col", message.role === "user" ? "items-end" : "items-start")}
              >
                {message.role === "assistant" ? (
                  <div className="max-w-[95%] rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-sm">
                    {message.content.length === 0 && streaming ? (
                      <div className="flex gap-1 py-1" aria-label="AI is typing">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                            style={{ animationDelay: `${i * 0.12}s` }}
                          />
                        ))}
                      </div>
                    ) : (
                      <>
                        <Markdown content={message.content} />
                        {diagramCode && (
                          <div className="mt-3 pt-2 border-t border-line/60 flex items-center justify-between">
                            <span className="text-[11px] text-success font-medium flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" />
                              {appliedId === message.id ? "Applied to canvas" : "Diagram detected"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                engine.applyDiagram(diagramCode);
                                setAppliedId(message.id);
                              }}
                              className="rounded-lg bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
                            >
                              Apply to Canvas
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="max-w-[92%] rounded-2xl rounded-tr-md bg-gradient-to-br from-primary to-primary-deep px-4 py-2.5 text-[13px] leading-relaxed text-white shadow-btn-primary">
                    {message.content}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {messages.length === 1 ? (
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick actions
            </p>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => handleSuggestion(suggestion.action)}
                disabled={streaming}
                className="flex w-full items-center gap-2.5 rounded-xl border border-accent-200/70 bg-accent-soft/60 px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-teal-900 transition-all duration-200 hover:border-accent-300 hover:bg-accent-soft disabled:opacity-50"
              >
                <suggestion.icon className="h-3.5 w-3.5" />
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-line p-3.5">
        <div className="relative">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type any diagram topic or change request..."
            className="focus-ring w-full rounded-btn2 border border-line bg-white py-3 pl-4 pr-12 text-[13px] text-foreground shadow-sm placeholder:text-muted-foreground transition-all duration-300"
            aria-label="Message the AI copilot"
            disabled={streaming}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-primary text-white transition-all duration-300 hover:bg-primary-deep hover:shadow-btn-primary-hover disabled:opacity-40 disabled:hover:bg-primary"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-muted-foreground">
          {error ? (
            <span className={fallback ? "text-gray-500" : "text-error"}>
              {fallback ? "Offline mode — local engine active" : error}
            </span>
          ) : (
            "Streaming results · auto-applies diagram to canvas"
          )}
        </p>
      </div>
    </motion.aside>
  );
}
