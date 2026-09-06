"use client";

import * as React from "react";
import { Clock, History, RotateCcw, Tag } from "lucide-react";
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { DiagramVersion } from "@/lib/architecture/versions";
import { storage } from "@/lib/data/storage";

interface VersionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: DiagramVersion[];
  onSaveNow: (label?: string) => void;
  onRestore: (version: DiagramVersion) => void;
  onCloseAfterRestore?: () => void;
}

export function VersionHistoryModal({
  open,
  onOpenChange,
  versions,
  onSaveNow,
  onRestore,
  onCloseAfterRestore,
}: VersionHistoryModalProps): React.ReactElement {
  const [label, setLabel] = React.useState("");
  const localOnly = storage.storageMode() === "local";

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-xl">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Version history
          </ModalTitle>
          <ModalDescription>
            Immutable snapshots of this diagram. Restoring swaps the model back — a new entry records the rollback.
          </ModalDescription>
        </ModalHeader>

        {localOnly ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-800">
            Snapshots are stored only in this browser. Clearing site data or switching devices will
            remove them — keep durable exports if you need them long-term.
          </p>
        ) : null}

        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
          {versions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Clock className="h-8 w-8 text-slate-300" />
              <p className="text-[13px] font-semibold text-foreground">No versions yet</p>
              <p className="text-[12.5px] text-muted-foreground">
                Every change applied through the AI assistant is snapshotted automatically. You can also save one manually.
              </p>
            </div>
          ) : (
            versions.map((version) => (
              <div
                key={version.version}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-foreground">v{version.version}</span>
                    <span className="text-[12px] font-semibold text-muted-foreground">{version.label}</span>
                  </div>
                  {version.changes.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {version.changes.slice(0, 4).map((change, i) => (
                        <li key={i} className="text-[11.5px] text-muted-foreground">
                          · {change}
                        </li>
                      ))}
                      {version.changes.length > 4 ? (
                        <li className="text-[11px] text-slate-400">…{version.changes.length - 4} more</li>
                      ) : null}
                    </ul>
                  ) : null}
                  <p className="mt-1.5 text-[10.5px] text-slate-400">
                    {new Date(version.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onRestore(version);
                    onCloseAfterRestore?.();
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  title="Restore this version"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 pt-4">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Snapshot label (optional, e.g. 'Pre-refactor')"
            aria-label="Snapshot label"
            className="focus-ring min-w-0 flex-1 rounded-btn2 border border-line bg-white px-3 py-2 text-[12.5px] text-foreground shadow-sm transition-all"
          />
          <Button
            onClick={() => {
              onSaveNow(label.trim() || undefined);
              setLabel("");
              toast("success", "Version saved");
            }}
          >
            <Tag className="h-4 w-4" />
            Save version
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}