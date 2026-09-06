"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading editor…</div>
  ),
});

interface MonacoPanelProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
  language?: string;
  height?: string;
}

const MERMAID_KEYWORDS = [
  "classDiagram", "sequenceDiagram", "erDiagram", "stateDiagram-v2", "flowchart",
  "class", "interface", "abstract", "direction", "participant", "activate",
  "deactivate", "autonumber", "note", "rect", "end", "alt", "opt", "loop",
  "par", "else", "and", "or", "critical", "choice", "condition", "send",
  "skinparam", "style", "linkStyle",
];

export function MonacoPanel({
  value,
  onChange,
  error,
  open,
  onClose,
  readOnly = false,
  language = "mermaid",
  height = "100%",
}: MonacoPanelProps): React.ReactElement | null {
  const beforeMount = React.useCallback((monaco: typeof import("monaco-editor")) => {
    monaco.languages.register({ id: "mermaid" });
    monaco.languages.setMonarchTokensProvider("mermaid", {
      keywords: MERMAID_KEYWORDS,
      tokenizer: {
        root: [
          [/classDiagram|sequenceDiagram|erDiagram|stateDiagram[-v2]*|flowchart|graph/, "keyword"],
          [/\b(class|interface|abstract|direction|participant|activate|deactivate|alt|opt|loop|par|else|and|or|note|rect|end)\b/, "keyword"],
          [/^[A-Za-z_$][A-Za-z0-9_$]*/, { cases: { "@keywords": "keyword", "@default": "type" } }],
          [/"(?:[^"\\]|\\.)*"/, "string"],
          [/\d+\.?\d*/, "number"],
          [/\+|-|#|~|\$|\*/ , "delimiter"],
          [/\b(classDiagram|sequenceDiagram|erDiagram)\b/, "keyword"],
        ],
      },
    });
    monaco.editor.defineTheme("archvision-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "1D4ED8", fontStyle: "bold" },
        { token: "type", foreground: "0F172A" },
        { token: "string", foreground: "059669" },
        { token: "number", foreground: "B45309" },
        { token: "delimiter", foreground: "64748B" },
        { token: "comment", foreground: "94A3B8", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#0F172A",
        "editorLineNumber.foreground": "#CBD5E1",
        "editorLineNumber.activeForeground": "#64748B",
        "editor.selectionBackground": "#DBEAFE",
        "editorLineHighlightBackground": "#F8FAFC",
      },
    });
  }, []);

  if (!open) return null;

  return (
    <motion.div
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="editor-panel relative flex h-full w-[420px] shrink-0 flex-col border-l border-line bg-white"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono text-[12px] font-semibold text-foreground">diagram.mmd</span>
          <span className="text-[11px] text-muted-foreground">two-way sync · 300ms</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-foreground"
          aria-label="Close code panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <MonacoEditor
          height={height}
          language={language === "mermaid" ? "mermaid" : language}
          value={value}
          onChange={(value) => onChange(value ?? "")}
          theme="archvision-light"
          beforeMount={beforeMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 12.5,
            fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, monospace",
            lineHeight: 22,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            padding: { top: 14, bottom: 14 },
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            scrollbar: { verticalScrollbarSize: 8 },
          }}
        />
      </div>

      {error ? (
        <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-[12px] leading-relaxed text-amber-800">{error}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-line px-4 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {value.split("\n").length} lines · {value.length} chars
        </span>
        <span className="text-[11px] font-medium text-emerald-600">saved locally</span>
      </div>
    </motion.div>
  );
}