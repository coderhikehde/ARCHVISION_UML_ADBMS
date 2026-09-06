"use client";

import * as React from "react";
import { Download, FilePlus2, Link2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ADR_STATUSES,
  adrsToMarkdownBundle,
  statusLabel,
  type AdrRecord,
  type AdrStatus,
} from "@/lib/architecture/adr";
import { adrsForDiagram, useAdrsStore } from "@/lib/editor/adrs";

/**
 * Architecture Decision Records panel — Nygard-format records bound to the
 * current diagram, linkable to nodes by name, exportable as markdown.
 */

const STATUS_STYLES: Record<AdrStatus, string> = {
  proposed: "border-amber-300 bg-amber-50 text-amber-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  deprecated: "border-slate-200 bg-slate-100 text-slate-500",
  superseded: "border-violet-200 bg-violet-50 text-violet-600",
};

interface AdrPanelProps {
  diagramId: string;
  diagramName: string;
  /** Node names from the full model — used for linking records to nodes. */
  nodeNames: string[];
  open: boolean;
  onClose: () => void;
}

export function AdrPanel({ diagramId, diagramName, nodeNames, open, onClose }: AdrPanelProps): React.ReactElement | null {
  const adrs = useAdrsStore((s) => s.adrs);
  const add = useAdrsStore((s) => s.add);
  const update = useAdrsStore((s) => s.update);
  const remove = useAdrsStore((s) => s.remove);
  const toggleNodeLink = useAdrsStore((s) => s.toggleNodeLink);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState({ title: "", status: "proposed" as AdrStatus, context: "", decision: "", consequences: "" });

  if (!open) return null;

  const records = adrsForDiagram(adrs, diagramId);

  const resetDraft = (): void => setDraft({ title: "", status: "proposed", context: "", decision: "", consequences: "" });

  const startCreate = (): void => {
    resetDraft();
    setEditingId(null);
    setCreating(true);
  };

  const startEdit = (record: AdrRecord): void => {
    setCreating(false);
    setEditingId(record.id);
    setDraft({
      title: record.title,
      status: record.status,
      context: record.context,
      decision: record.decision,
      consequences: record.consequences,
    });
  };

  const submit = (): void => {
    if (!draft.title.trim()) return;
    if (creating) {
      const record = add(diagramId, draft);
      setCreating(false);
      setEditingId(record.id);
    } else if (editingId) {
      update(diagramId, editingId, draft);
    }
    resetDraft();
  };

  const exportBundle = (): void => {
    const blob = new Blob([adrsToMarkdownBundle(records)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${diagramName.replace(/\s+/g, "-").toLowerCase() || "architecture"}-adrs.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Architecture decisions">
      <div className="glass flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-line shadow-panel-float">
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="text-[14px] font-extrabold tracking-tight text-foreground">Architecture decisions</p>
            <p className="text-[11.5px] text-muted-foreground">Nygard-format ADRs · stored locally · export as markdown</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startCreate}
              disabled={creating}
              className="flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1.5 text-[11.5px] font-bold text-primary transition-colors hover:border-primary/40 disabled:opacity-50"
            >
              <FilePlus2 className="h-3.5 w-3.5" /> New
            </button>
            {records.length > 0 ? (
              <button
                type="button"
                onClick={exportBundle}
                className="flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1.5 text-[11.5px] font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" /> Export .md
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-foreground"
              aria-label="Close architecture decisions"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {creating || editingId !== null ? (
            <form
              className="space-y-2.5 rounded-xl border border-primary/25 bg-primary/5 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Decision title — e.g. Use JWT for stateless auth"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-semibold text-foreground outline-none focus:border-primary/40"
                aria-label="Decision title"
              />
              <select
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as AdrStatus }))}
                className="cursor-pointer rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] font-semibold"
                aria-label="Status"
              >
                {ADR_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
              {(
                [
                  ["context", "Context — forces at play, constraints"],
                  ["decision", "Decision — what we will do"],
                  ["consequences", "Consequences — outcomes, trade-offs"],
                ] as const
              ).map(([field, placeholder]) => (
                <textarea
                  key={field}
                  value={draft[field]}
                  onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                  placeholder={placeholder}
                  rows={field === "context" ? 3 : 2}
                  className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] leading-snug text-foreground outline-none focus:border-primary/40"
                  aria-label={placeholder.split(" — ")[0]}
                />
              ))}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!draft.title.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-primary-deep disabled:opacity-40"
                >
                  {creating ? "Create record" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditingId(null);
                    resetDraft();
                  }}
                  className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-bold text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {records.length === 0 && !creating ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-[13px] font-bold text-foreground">No decision records yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-snug text-muted-foreground">
                Capture the why behind your architecture: context, the decision taken, and its consequences — then
                link records to the nodes they affect.
              </p>
            </div>
          ) : null}

          {records.map((record) =>
            editingId === record.id ? null : (
              <article key={record.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(record)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Edit ${record.title}`}
                  >
                    <p className="truncate text-[13.5px] font-bold text-foreground">
                      {record.number}. {record.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{record.date.slice(0, 10)}</p>
                  </button>
                  <span className={cn("shrink-0 rounded-pill border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", STATUS_STYLES[record.status])}>
                    {statusLabel(record.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(diagramId, record.id)}
                    className="rounded-md p-1 text-slate-300 transition-colors hover:bg-error/10 hover:text-error"
                    aria-label={`Delete ${record.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <dl className="mt-2 space-y-1.5 text-[12px] leading-snug">
                  {(
                    [
                      ["Context", record.context],
                      ["Decision", record.decision],
                      ["Consequences", record.consequences],
                    ] as const
                  ).map(([label, body]) =>
                    body.trim() ? (
                      <div key={label}>
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</dt>
                        <dd className="whitespace-pre-wrap text-foreground/90">{body}</dd>
                      </div>
                    ) : null
                  )}
                </dl>

                {record.linkedNodes.length > 0 ? (
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    {record.linkedNodes.map((node) => (
                      <span key={node} className="rounded-md border border-line bg-white px-1.5 py-0.5 font-semibold text-foreground">
                        {node}
                      </span>
                    ))}
                  </p>
                ) : null}

                {editingId === null && !creating ? (
                  <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
                    <label className="text-[11px] font-semibold text-muted-foreground">Links to:</label>
                    <LinkedNodePicker
                      nodeNames={nodeNames}
                      linked={record.linkedNodes}
                      onPick={(nodeName) => toggleNodeLink(diagramId, record.id, nodeName)}
                    />
                  </div>
                ) : null}
              </article>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** Link/unlink one node at a time; already-linked names render struck-through. */
function LinkedNodePicker({
  nodeNames,
  linked,
  onPick,
}: {
  nodeNames: string[];
  linked: string[];
  onPick: (nodeName: string) => void;
}): React.ReactElement {
  const available = nodeNames.slice(0, 40);
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
        e.target.value = "";
      }}
      className="cursor-pointer rounded-lg border border-line bg-white px-1.5 py-1 text-[11px] font-semibold text-muted-foreground"
      aria-label="Link or unlink this decision to a node"
    >
      <option value="">+ toggle link…</option>
      {available.map((name) => (
        <option key={name} value={name}>
          {linked.includes(name) ? `✓ ${name}` : name}
        </option>
      ))}
    </select>
  );
}