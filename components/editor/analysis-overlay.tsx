"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ScanSearch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisMetric, AnalysisResult } from "@/types/diagram";
import { computeAnalysis } from "@/lib/analysis/critic";
import type { UMLModel } from "@/types/diagram";
import { Progress } from "@/components/ui/progress";

interface AnalysisOverlayProps {
  open: boolean;
  onClose: () => void;
  model: UMLModel;
}

const METRIC_COLOR: Record<AnalysisMetric["severity"], string> = {
  critical: "bg-error",
  warning: "bg-warning",
  info: "bg-primary",
};

const SEVERITY_BADGE: Record<AnalysisMetric["severity"], string> = {
  critical: "bg-red-50 text-error border-red-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-primary-50 text-primary-deep border-primary-100",
};

export function AnalysisOverlay({ open, onClose, model }: AnalysisOverlayProps): React.ReactElement | null {
  const [analysis, setAnalysis] = React.useState<AnalysisResult | null>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setRunning(true);
    const timer = setTimeout(() => {
      setAnalysis(computeAnalysis(model));
      setRunning(false);
    }, 650);
    return () => clearTimeout(timer);
  }, [open, model]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Architecture analysis"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="glass max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-line shadow-panel-float"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ScanSearch className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-foreground">Architecture Critic</h2>
              <p className="text-[12px] text-muted-foreground">
                {model.classes.length} classes · {model.links.length} relations analyzed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-foreground"
            aria-label="Close analysis"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(82vh-80px)] overflow-y-auto px-6 py-5">
          {running ? (
            <div className="space-y-4 py-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-3 w-1/3 rounded-full bg-slate-200" />
                  <div className="h-2.5 w-full rounded-full bg-slate-100" />
                </div>
              ))}
              <p className="pt-2 text-center text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
                Running graph algorithms…
              </p>
            </div>
          ) : analysis ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {analysis.metrics.map((metric, index) => (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1], delay: index * 0.06 }}
                    className="rounded-2xl border border-line bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12.5px] font-bold text-foreground">{metric.label}</p>
                      <span className={cn("rounded-pill border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", SEVERITY_BADGE[metric.severity])}>
                        {metric.severity}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex-1">
                        <Progress value={(metric.value / metric.max) * 100} indicatorClassName={METRIC_COLOR[metric.severity]} />
                      </div>
                      <span className="font-mono text-[12px] font-bold text-foreground">
                        {Math.round(metric.value * 10) / 10}
                        <span className="text-slate-400">/{metric.max}</span>
                      </span>
                    </div>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{metric.description}</p>
                  </motion.div>
                ))}
              </div>

              <section>
                <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-foreground">Insights</h3>
                <ul className="space-y-1.5">
                  {analysis.insights.map((insight, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
                      className="flex gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-[12.5px] leading-relaxed text-slate-700"
                    >
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      {insight}
                    </motion.li>
                  ))}
                  {analysis.insights.length === 0 ? (
                    <li className="text-[12.5px] text-muted">No qualitative issues surfaced by the graph analysis.</li>
                  ) : null}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-foreground">
                  Recommended refactorings
                </h3>
                <ul className="space-y-1.5">
                  {analysis.refactorings.map((refactoring, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.4 + index * 0.05 }}
                      className="flex gap-2.5 rounded-xl border border-accent-200/70 bg-accent-soft/50 px-4 py-2.5 text-[12.5px] leading-relaxed text-teal-900"
                    >
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                      {refactoring}
                    </motion.li>
                  ))}
                </ul>
              </section>

              <p className="pb-1 text-center text-[11px] text-muted-foreground">
                Run {analysis.generatedAt.slice(0, 16).replace("T", " · ")} · qualitative layer available when an AI provider key is set
              </p>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}