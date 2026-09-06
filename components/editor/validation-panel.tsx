"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValidationResult } from "@/types/diagram";
import { Progress } from "@/components/ui/progress";

interface ValidationPanelProps {
  result: ValidationResult | null;
  open: boolean;
  onClose: () => void;
}

export function ValidationPanel({ result, open, onClose }: ValidationPanelProps): React.ReactElement | null {
  if (!open) return null;

  const issues = result?.issues ?? [];
  const score = result?.score ?? 0;
  const breakdown: Array<{ rule: string; label: string; penalty: number }> =
    (result as { scoreBreakdown?: Array<{ rule: string; label: string; penalty: number }> } | null)?.scoreBreakdown ?? [];
  const checks =
    (result as { checks?: Array<{ rule: string; ok: boolean }> } | null)?.checks ?? [];
  const passedCount = checks.filter((c) => c.ok).length;
  const criticals = issues.filter((i) => i.severity === "critical").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return (
    <motion.aside
      initial={{ x: 28, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 28, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="glass flex h-full w-[360px] shrink-0 flex-col border-l border-line"
      aria-label="Validation panel"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-success">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold tracking-tight text-foreground">Architecture Validation</p>
            <p className="text-[11px] text-muted-foreground">
              {checks.length} rules · {passedCount} passed · live
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-foreground"
          aria-label="Close validation panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quality score
              </p>
              <p
                className={cn(
                  "mt-1 text-3xl font-extrabold tracking-tight",
                  score >= 90 ? "text-success" : score >= 70 ? "text-warning" : "text-error"
                )}
              >
                {score}
                <span className="text-base font-bold text-muted-foreground">/100</span>
              </p>
            </div>
            <div className="flex gap-3 text-right text-[11.5px]">
              <div>
                <p className="font-bold text-error">{criticals}</p>
                <p className="text-muted-foreground">critical</p>
              </div>
              <div>
                <p className="font-bold text-amber-700">{warnings}</p>
                <p className="text-muted-foreground">warnings</p>
              </div>
              <div>
                <p className="font-bold text-foreground">{issues.length}</p>
                <p className="text-muted-foreground">total</p>
              </div>
            </div>
          </div>
          <Progress
            value={score}
            className="mt-3 h-2.5"
            indicatorClassName={score >= 90 ? "bg-success" : score >= 70 ? "bg-warning" : "bg-error"}
          />
        </div>

        {breakdown.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Score breakdown (why this score)
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {breakdown.map((entry) => (
                <li
                  key={entry.rule}
                  className="flex items-start justify-between gap-3 text-[12px]"
                >
                  <span className="min-w-0 leading-snug text-muted">{entry.label}</span>
                  <span className="shrink-0 font-mono text-[10.5px] font-bold text-foreground/70">
                    −{entry.penalty}
                  </span>
                </li>
              ))}
              {breakdown.length < checks.length ? (
                <li className="pt-1 text-[11.5px] font-semibold text-success">
                  +{checks.length - breakdown.length} checks passed
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {issues.length === 0 ? (
          <div className="mt-5 flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <p className="text-sm font-bold text-foreground">Model is healthy</p>
            <p className="text-[12.5px] text-muted-foreground">
              No validation issues detected. Export is unlocked.
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            <AnimatePresence initial={false}>
              {issues.map((issue, index) => (
                <motion.li
                  key={`${issue.rule}-${index}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1], delay: index * 0.04 }}
                  className={cn(
                    "rounded-xl border px-3.5 py-3",
                    issue.severity === "critical" && "border-red-200 bg-red-50/70",
                    issue.severity === "warning" && "border-amber-200 bg-amber-50/70",
                    issue.severity === "info" && "border-line bg-surface"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {issue.severity === "critical" ? (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                    ) : issue.severity === "warning" ? (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-[12.5px] font-medium leading-snug",
                          issue.severity === "info" ? "text-muted" : "text-foreground"
                        )}
                      >
                        {issue.message}
                      </p>
                      <p className="mt-1 font-mono text-[10.5px] uppercase tracking-wide text-slate-400">
                        rule: {issue.rule}
                        {issue.target ? ` · ${issue.target}` : ""}
                      </p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {criticals > 0 ? (
          <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-[12px] leading-relaxed text-error">
            Export is <span className="font-bold">blocked</span> while critical issues exist. Fix them or
            override to export anyway.
          </p>
        ) : null}
      </div>
    </motion.aside>
  );
}