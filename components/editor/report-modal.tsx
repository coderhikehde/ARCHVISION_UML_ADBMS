"use client";

import * as React from "react";
import { Check, ClipboardList, Copy, Download, FileText, Loader2, Sparkles } from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/shared/markdown";
import { copyToClipboard, downloadFile } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { buildReport, reportToMarkdown, filenameForReport } from "@/lib/architecture/report";
import { describeArchitecture, type DescribeResult } from "@/lib/ai/describe";
import { pdfFromElement } from "@/lib/export/engine";
import { storage } from "@/lib/data/storage";
import type { Architecture } from "@/types/diagram";

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagramId: string;
  diagramName: string;
  architecture?: Architecture | null;
}

export function ReportModal({ open, onOpenChange, diagramId, diagramName, architecture }: ReportModalProps): React.ReactElement | null {
  const report = React.useMemo(() => (architecture ? buildReport(architecture) : null), [architecture]);
  const [narrative, setNarrative] = React.useState<DescribeResult | null>(null);
  const [narrativeLoading, setNarrativeLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const requestRef = React.useRef(0);

  const refreshNarrative = React.useCallback(async (): Promise<void> => {
    if (!architecture) return;
    const requestId = ++requestRef.current;
    setNarrative(null);
    setNarrativeLoading(true);
    const result = await describeArchitecture(architecture);
    if (requestRef.current === requestId) {
      setNarrative(result);
      setNarrativeLoading(false);
    }
  }, [architecture]);

  React.useEffect(() => {
    if (open) void refreshNarrative();
    if (!open) {
      requestRef.current += 1;
      setNarrative(null);
      setNarrativeLoading(false);
      setCopied(false);
    }
  }, [open, refreshNarrative]);

  if (!report) return null;

  const markdown = reportToMarkdown(report, narrative?.text);
  const { validation, stats } = report;
  const criticalCount = validation.issues.filter((i) => i.severity === "critical").length;
  const warningCount = validation.issues.filter((i) => i.severity === "warning").length;
  const infoCount = validation.issues.filter((i) => i.severity === "info").length;
  const scoreColor = validation.score >= 70 ? "text-emerald-600" : validation.score >= 40 ? "text-amber-600" : "text-red-600";

  const handleCopy = async (): Promise<void> => {
    await copyToClipboard(markdown);
    setCopied(true);
    toast("success", "Report copied to clipboard");
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = (): void => {
    downloadFile(markdown, filenameForReport(report.title), "text/markdown");
    toast("success", "Report downloaded as Markdown");
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await storage.saveValidation(diagramId, { issues: validation.issues, score: validation.score });
      toast("success", "Report saved — persisted to your workspace");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not save the report. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async (): Promise<void> => {
    if (!contentRef.current) return;
    setExportingPdf(true);
    try {
      // html2canvas only captures the visible viewport of a scrollable
      // element — render a full-height offscreen clone for the PDF.
      const original = contentRef.current;
      const clone = original.cloneNode(true) as HTMLDivElement;
      clone.style.position = "fixed";
      clone.style.left = "-10000px";
      clone.style.top = "0";
      clone.style.width = "840px";
      clone.style.maxHeight = "none";
      clone.style.height = "auto";
      clone.style.overflow = "visible";
      document.body.appendChild(clone);
      try {
        await new Promise((resolve) => setTimeout(resolve, 120));
        await pdfFromElement(clone, `${filenameForReport(report.title).replace(/\.md$/, "")}.pdf`);
      } finally {
        clone.remove();
      }
      toast("success", "Report exported as PDF");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-3xl">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Architecture report
          </ModalTitle>
          <ModalDescription>
            Deterministic report for <span className="font-semibold text-foreground">{diagramName}</span> — built from the
            canonical model, persisted on save.
          </ModalDescription>
        </ModalHeader>

        <div ref={contentRef} className="max-h-[52vh] overflow-y-auto rounded-2xl border border-line bg-surface px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white p-4">
            <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 border-line bg-surface">
              <span className={`text-lg font-extrabold ${scoreColor}`}>{validation.score}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">/100</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-foreground">{report.title}</p>
              <p className="text-[12px] text-muted-foreground">
                {report.diagramType} diagram · {stats.nodes} nodes · {stats.relationships} relationships · {stats.attributes}{" "}
                attributes · {stats.methods} methods
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {criticalCount > 0 ? <Badge variant="error">{criticalCount} critical</Badge> : null}
                {warningCount > 0 ? <Badge variant="warning">{warningCount} warning{warningCount === 1 ? "" : "s"}</Badge> : null}
                {infoCount > 0 ? <Badge variant="soft-blue">{infoCount} info</Badge> : null}
                <Badge variant="success">{validation.passed.length} checks passed</Badge>
              </div>
            </div>
          </div>

          {stats.byKind.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {stats.byKind.map((entry) => (
                <Badge key={entry.kind} variant="outline" className="text-[11px]">
                  {entry.kind} × {entry.count}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">AI overview</p>
            <div className="flex items-center gap-2">
              {narrative ? (
                <Badge variant={narrative.mode === "online" ? "success" : "outline"} className="text-[10px]">
                  {narrative.mode === "online" ? "GPT-4o / Claude" : "offline — local extraction engine"}
                </Badge>
              ) : null}
              <button
                type="button"
                onClick={() => void refreshNarrative()}
                disabled={narrativeLoading}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                {narrativeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Regenerate
              </button>
            </div>
          </div>
          <div className="mb-5 rounded-xl border border-line bg-white px-4 py-3">
            {narrativeLoading ? (
              <div className="flex items-center gap-2 py-2 text-[12.5px] font-medium text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Preparing AI overview…
              </div>
            ) : narrative ? (
              <p className="text-[13px] leading-relaxed text-foreground">{narrative.text}</p>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">AI overview unavailable — the report below is still complete.</p>
            )}
          </div>

          <div className="rounded-xl border border-line bg-white px-4 py-4">
            <Markdown content={markdown} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-3">
          <p className="text-[11.5px] text-muted-foreground">
            {markdown.length.toLocaleString()} chars · markdown · persisted to your workspace on save
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleCopy()} disabled={markdown.length === 0}>
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              <FileText className="h-4 w-4" />
              .md
            </Button>
            <Button variant="outline" onClick={() => void handleExportPdf()} loading={exportingPdf}>
              <Download className="h-4 w-4" />
              PDF
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Save report
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}