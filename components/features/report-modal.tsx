/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Lightbulb,
  Copy,
  Check,
  Loader2,
  BookOpen,
  Code2,
  RefreshCw,
} from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/shared/markdown";

interface ExplainUMLModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mermaidCode: string;
  diagramType: any;
  diagramName?: string;
  validationScore?: number | null;
  versions?: any[];
  [key: string]: any;
}

export function ExplainUMLModal({
  open,
  onOpenChange,
  mermaidCode,
  diagramType,
}: ExplainUMLModalProps): React.ReactElement {
  const [explanation, setExplanation] = React.useState("");
  const [mode, setMode] = React.useState<"simple" | "technical">("simple");
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (open && !explanation) {
      void generateExplanation("simple");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const generateExplanation = async (
    selectedMode: "simple" | "technical"
  ): Promise<void> => {
    setLoading(true);
    setExplanation("");
    setError("");

    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mermaidCode,
          diagramType,
          mode: selectedMode,
        }),
      });

      if (!res.ok) throw new Error("Failed to fetch");

      const data = (await res.json()) as { explanation: string };
      setExplanation(data.explanation);
    } catch {
      setError("Could not generate explanation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleModeSwitch = (newMode: "simple" | "technical"): void => {
    setMode(newMode);
    void generateExplanation(newMode);
  };

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(explanation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (): void => {
    onOpenChange(false);
    setExplanation("");
    setMode("simple");
    setError("");
  };

  return (
    <Modal open={open} onOpenChange={handleClose}>
      <ModalContent className="max-w-2xl">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Explain This UML
            <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {String(diagramType)}
            </span>
          </ModalTitle>
          <ModalDescription>
            AI breaks down your diagram in plain language.
          </ModalDescription>
        </ModalHeader>

        <div className="flex gap-2 border-b border-gray-100 pb-3">
          <button
            onClick={() => handleModeSwitch("simple")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              mode === "simple"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-500 hover:text-gray-800"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Simple
          </button>
          <button
            onClick={() => handleModeSwitch("technical")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              mode === "technical"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-500 hover:text-gray-800"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Technical
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void generateExplanation(mode)}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </Button>
          </div>
        </div>

        <div className="min-h-[260px]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-400">Analyzing your diagram…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-red-500">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void generateExplanation(mode)}
              >
                Try again
              </Button>
            </div>
          )}

          {explanation && !loading && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="prose prose-sm max-w-none py-2"
              >
                <Markdown content={explanation} />
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {explanation && !loading && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400">
              AI-generated · may not be 100% accurate
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}

export const ReportModal = ExplainUMLModal;
