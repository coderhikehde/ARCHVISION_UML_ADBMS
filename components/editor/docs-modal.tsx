"use client";

import * as React from "react";
import { Check, Copy, FileText, Loader2, Sparkles } from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/shared/markdown";
import { useAIChat } from "@/hooks/useAIChat";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { generateDocumentation } from "@/lib/architecture/docs";
import type { Architecture } from "@/types/diagram";

interface DocsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mermaidCode: string;
  diagramName: string;
  architecture?: Architecture | null;
}

export function DocsModal({ open, onOpenChange, mermaidCode, diagramName, architecture }: DocsModalProps): React.ReactElement {
  const { streaming, error, stream } = useAIChat();
  const [content, setContent] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const generatedRef = React.useRef(false);

  const generate = async (): Promise<void> => {
    setContent("");
    // Deterministic documentation generated from the canonical model —
    // the AI path never overrides the model-derived truth.
    if (architecture) {
      setContent(generateDocumentation(architecture));
      return;
    }
    await stream(
      {
        message: `Generate a design document for "${diagramName}"`,
        action: "explain",
        mermaid: mermaidCode,
      },
      {
        onDelta: (delta) => setContent((prev) => prev + delta),
        onDone: () => void 0,
        onError: () => void 0,
      }
    );
  };

  React.useEffect(() => {
    if (open && !generatedRef.current) {
      generatedRef.current = true;
      void generate();
    }
    if (!open) {
      generatedRef.current = false;
      setContent("");
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCopy = async (): Promise<void> => {
    await copyToClipboard(content);
    setCopied(true);
    toast("success", "Copied to clipboard");
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = (): void => {
    downloadFile(content, "ARCHITECTURE.md", "text/markdown");
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Design document
          </ModalTitle>
          <ModalDescription>
            AI-generated architecture documentation for <span className="font-semibold text-foreground">{diagramName}</span>.
          </ModalDescription>
        </ModalHeader>

        <div className="min-h-[280px] max-h-[52vh] overflow-y-auto rounded-2xl border border-line bg-surface px-5 py-4">
          {content.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14">
              {streaming ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-[12.5px] font-semibold text-muted-foreground">
                    Synthesizing architecture documentation…
                  </p>
                </>
              ) : (
                <>
                  <Sparkles className="h-6 w-6 text-teal-600" />
                  <p className="text-[12.5px] text-muted-foreground">
                    {error ?? "Click generate to create the design document."}
                  </p>
                </>
              )}
            </div>
          ) : (
            <Markdown content={content} />
          )}
        </div>

        <div className="flex items-center justify-between pt-3">
          <p className="text-[11.5px] text-muted-foreground">
            {content.length > 0 ? `${content.length.toLocaleString()} chars · markdown` : "ready when generation completes"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleCopy()} disabled={content.length === 0}>
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={content.length === 0}>
              <FileText className="h-4 w-4" />
              README.md
            </Button>
            <Button onClick={() => void generate()} loading={streaming}>
              <Sparkles className="h-4 w-4" />
              Regenerate
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}