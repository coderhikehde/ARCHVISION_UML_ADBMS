"use client";

import { create } from "zustand";
import type { AdrRecord, AdrStatus } from "@/lib/architecture/adr";

/**
 * ADR store — per-diagram decision records persisted to localStorage
 * (same zero-infra contract as comments). Records are client-side until a
 * server-backed workspace lands; export produces portable markdown.
 */

const STORAGE_KEY = "archvision:adrs";
const DB_MODE = process.env.NEXT_PUBLIC_DATA_MODE === "db";

export interface NewAdrInput {
  title: string;
  status: AdrStatus;
  context: string;
  decision: string;
  consequences: string;
  linkedNodes?: string[];
}

interface AdrsState {
  adrs: Record<string, AdrRecord[]>;
  add: (diagramId: string, input: NewAdrInput) => AdrRecord;
  update: (diagramId: string, id: string, patch: Partial<Omit<AdrRecord, "id" | "number">>) => void;
  remove: (diagramId: string, id: string) => void;
  toggleNodeLink: (diagramId: string, id: string, nodeName: string) => void;
  syncFromServer: (diagramId: string) => Promise<void>;
}

function load(): Record<string, AdrRecord[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AdrRecord[]>;
    // Backfill every diagram bucket — old blobs must not crash the writers.
    const safe: Record<string, AdrRecord[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      safe[key] = Array.isArray(value) ? value : [];
    }
    return safe;
  } catch {
    return {};
  }
}

function save(adrs: Record<string, AdrRecord[]>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(adrs));
  } catch {
    // storage unavailable — records stay in memory only
  }
}

function nextNumber(records: AdrRecord[]): number {
  return records.reduce((max, adr) => Math.max(max, adr.number), 0) + 1;
}

export const useAdrsStore = create<AdrsState>((set, get) => ({
  adrs: load(),

  add: (diagramId, input) => {
    const records = get().adrs[diagramId] ?? [];
    const record: AdrRecord = {
      id: `adr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      number: nextNumber(records),
      title: input.title.trim() || "Untitled decision",
      status: input.status,
      context: input.context,
      decision: input.decision,
      consequences: input.consequences,
      date: new Date().toISOString(),
      linkedNodes: [...(input.linkedNodes ?? [])],
    };
    const next = { ...get().adrs, [diagramId]: [record, ...records] };
    save(next);
    set({ adrs: next });
    if (DB_MODE) {
      void fetch(`/api/diagrams/${encodeURIComponent(diagramId)}/adrs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: record.title, status: record.status, context: record.context, decision: record.decision, consequences: record.consequences, linkedNodes: record.linkedNodes }),
      }).catch(() => undefined);
    }
    return record;
  },

  update: (diagramId, id, patch) => {
    const records = get().adrs[diagramId] ?? [];
    const next = {
      ...get().adrs,
      [diagramId]: records.map((adr) => (adr.id === id ? { ...adr, ...patch } : adr)),
    };
    save(next);
    set({ adrs: next });
    if (DB_MODE) {
      void fetch(`/api/adrs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => undefined);
    }
  },

  remove: (diagramId, id) => {
    const records = get().adrs[diagramId] ?? [];
    const next = { ...get().adrs, [diagramId]: records.filter((adr) => adr.id !== id) };
    save(next);
    set({ adrs: next });
    if (DB_MODE) {
      void fetch(`/api/adrs/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    }
  },

  toggleNodeLink: (diagramId, id, nodeName) => {
    const records = get().adrs[diagramId] ?? [];
    const target = records.find((r) => r.id === id);
    const nextLinked = target
      ? target.linkedNodes.includes(nodeName)
        ? target.linkedNodes.filter((n) => n !== nodeName)
        : [...target.linkedNodes, nodeName]
      : [];
    const next = {
      ...get().adrs,
      [diagramId]: records.map((adr) =>
        adr.id === id ? { ...adr, linkedNodes: nextLinked } : adr
      ),
    };
    save(next);
    set({ adrs: next });
    if (DB_MODE && target) {
      void fetch(`/api/adrs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedNodes: nextLinked }),
      }).catch(() => undefined);
    }
  },

  syncFromServer: async (diagramId: string) => {
    if (!DB_MODE) return;
    try {
      const res = await fetch(`/api/diagrams/${encodeURIComponent(diagramId)}/adrs`);
      if (!res.ok) return;
      const json = (await res.json()) as { ok?: boolean; data?: Array<{ id: string; number: number; title: string; status: string; context: string; decision: string; consequences: string; linkedNodes: string[]; createdAt: string }> };
      if (!json.ok || !Array.isArray(json.data)) return;
      const serverRecords: AdrRecord[] = json.data.map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        status: r.status as AdrRecord["status"],
        context: r.context,
        decision: r.decision,
        consequences: r.consequences,
        date: r.createdAt,
        linkedNodes: r.linkedNodes ?? [],
      }));
      const current = get().adrs[diagramId] ?? [];
      const serverIds = new Set(serverRecords.map((r) => r.id));
      const localOnly = current.filter((r) => !serverIds.has(r.id) && r.id.startsWith("adr_"));
      const merged = [...serverRecords, ...localOnly].sort((a, b) => b.number - a.number);
      const next = { ...get().adrs, [diagramId]: merged };
      save(next);
      set({ adrs: next });
    } catch {
      // offline
    }
  },
}));

/** All ADRs of one diagram, display order. */
export function adrsForDiagram(adrs: Record<string, AdrRecord[]>, diagramId: string): AdrRecord[] {
  return [...(adrs[diagramId] ?? [])].sort((a, b) => b.number - a.number);
}

/** ADRs bound to a specific node name. */
export function adrsForNode(adrs: Record<string, AdrRecord[]>, diagramId: string, nodeName: string): AdrRecord[] {
  return adrsForDiagram(adrs, diagramId).filter((adr) => adr.linkedNodes.includes(nodeName));
}