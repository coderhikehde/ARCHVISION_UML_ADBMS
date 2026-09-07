/* eslint-disable */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, Lock } from "lucide-react";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { storage } from "@/lib/data/storage";
import { useWorkspaceStore } from "@/lib/data/workspace-store";
import { toast } from "@/components/ui/toast";

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VISIBILITY_OPTIONS = [
  {
    value: "private",
    label: "Private",
    description: "Only visible to your account",
    icon: <Lock className="h-3.5 w-3.5" />,
  },
] as const;

export function NewProjectModal({ open, onOpenChange }: NewProjectModalProps): React.ReactElement {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<(typeof VISIBILITY_OPTIONS)[number]["value"]>("private");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setVisibility("private");
    }
  }, [open]);

  const createProject = async (): Promise<void> => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      // 1. Create the project
      const project = await storage.createProject({ 
        name: name.trim(), 
        description: description.trim() || undefined 
      });

      // 2. High-quality FinTech Ledger UML starter template
      const defaultCode = `classDiagram
    class User {
        +UUID userId PK
        +String fullName
        +String email UK
        +String kycStatus
        +DateTime createdAt
        +createWallet()
        +verifyKYC()
    }

    class Wallet {
        +UUID walletId PK
        +UUID userId FK
        +Decimal balance
        +String currency
        +Boolean isFrozen
        +deposit(amount)
        +withdraw(amount)
    }

    class Transaction {
        +UUID transactionId PK
        +UUID sourceWalletId FK
        +UUID destWalletId FK
        +Decimal amount
        +String status
        +DateTime timestamp
        +executeTransaction()
        +rollback()
    }

    class LedgerEntry {
        +UUID entryId PK
        +UUID transactionId FK
        +Decimal debitAmount
        +Decimal creditAmount
        +String entryType
        +recordEntry()
    }

    class FraudDetectionService {
        +UUID checkId PK
        +UUID transactionId FK
        +Float riskScore
        +Boolean isApproved
        +evaluateRisk()
    }

    User "1" -- "1..*" Wallet : owns
    Wallet "1" -- "0..*" Transaction : initiates
    Transaction "1" -- "2" LedgerEntry : logs_double_entry
    Transaction "1" -- "1" FraudDetectionService : validated_by`;

      let diagram: unknown = null;
      try {
        // Fallback-tolerant API POST request to generate the diagram
        const res = await fetch(`/api/projects/${project.id}/diagrams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Payment & Ledger Architecture",
            type: "CLASS",
            mermaidCode: defaultCode
          })
        });
        if (res.ok) {
          diagram = await res.json();
        }
      } catch (diagramErr) {
        console.error("Failed to create default diagram:", diagramErr);
      }

      toast("success", `Project "${name.trim()}" created! Loading workspace...`);
      onOpenChange(false);
      
      // Reload workspace store state
      await useWorkspaceStore.getState().reload();

      // Redirect user directly to the new diagram's editor or the project dashboard
      if (diagram && diagram.id) {
        router.push(`/editor/${diagram.id}`);
      } else {
        router.push(`/dashboard?projectId=${project.id}`);
      }
    } catch (err) {
      toast("error", err instanceof Error ? `Failed to create project: ${err.message}` : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>Create a project</ModalTitle>
          <ModalDescription>
            Projects group related diagrams into one workspace. Projects are private to your account.
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="np-name">Project name</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Payments Platform"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-desc">Description</Label>
            <Textarea
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this workspace about?"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <div className="grid grid-cols-3 gap-2">
              {VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVisibility(option.value)}
                  aria-pressed={visibility === option.value}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all duration-200",
                    visibility === option.value
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-line hover:border-slate-300"
                  )}
                >
                  <span className={cn("flex items-center gap-1.5 text-[12.5px] font-bold", visibility === option.value ? "text-primary" : "text-foreground")}>
                    {option.icon}
                    {option.label}
                  </span>
                  <span className="text-[10.5px] leading-snug text-muted-foreground">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void createProject()} disabled={!name.trim() || creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Create project
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
