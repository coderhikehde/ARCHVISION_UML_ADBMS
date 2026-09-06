"use client";

import { create } from "zustand";

export interface DiagramComment {
  id: string;
  diagramId: string;
  author: string;
  text: string;
  x: number;
  y: number;
  createdAt: number;
}

interface CommentsState {
  comments: Record<string, DiagramComment[]>;
  open: boolean;
  focusedId: string | null;
}

interface CommentsActions {
  addComment: (diagramId: string, comment: Omit<DiagramComment, "id" | "createdAt" | "diagramId">) => string;
  updateText: (diagramId: string, id: string, text: string) => void;
  removeComment: (diagramId: string, id: string) => void;
  setOpen: (open: boolean) => void;
  focusComment: (id: string | null) => void;
  syncFromServer: (diagramId: string) => Promise<void>;
}

const STORAGE_KEY = "archvision:comments";
const CURRENT_USER = "you";
const DB_MODE = process.env.NEXT_PUBLIC_DATA_MODE === "db";

/** Stable empty array — safe to return from zustand selectors (referential stability). */
export const EMPTY_COMMENTS: DiagramComment[] = [];

function load(): Record<string, DiagramComment[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DiagramComment[]>;
  } catch {
    return {};
  }
}

function save(comments: Record<string, DiagramComment[]>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
  } catch {
    // storage unavailable — comments stay in memory only
  }
}

export const useCommentsStore = create<CommentsState & CommentsActions>((set, get) => ({
  comments: load(),
  open: false,
  focusedId: null,

  addComment: (diagramId, comment) => {
    const id = `c_${crypto.randomUUID().replace(/-/g, "")}`;
    const entry: DiagramComment = { ...comment, diagramId, id, createdAt: Date.now() };
    const next = {
      ...get().comments,
      [diagramId]: [...(get().comments[diagramId] ?? []), entry],
    };
    save(next);
    set({ comments: next, open: true, focusedId: id });
    if (DB_MODE) {
      void fetch(`/api/diagrams/${encodeURIComponent(diagramId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment.text, x: comment.x, y: comment.y }),
      }).catch(() => undefined);
    }
    return id;
  },

  updateText: (diagramId, id, text) => {
    const next = {
      ...get().comments,
      [diagramId]: (get().comments[diagramId] ?? []).map((c) => (c.id === id ? { ...c, text } : c)),
    };
    save(next);
    set({ comments: next });
  },

  removeComment: (diagramId, id) => {
    const next = {
      ...get().comments,
      [diagramId]: (get().comments[diagramId] ?? []).filter((c) => c.id !== id),
    };
    save(next);
    set({ comments: next, focusedId: get().focusedId === id ? null : get().focusedId });
    if (DB_MODE) {
      void fetch(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    }
  },

  /** Hydrate from server when in DB mode — merges server comments with local cache. */
  syncFromServer: async (diagramId: string) => {
    if (!DB_MODE) return;
    try {
      const res = await fetch(`/api/diagrams/${encodeURIComponent(diagramId)}/comments`);
      if (!res.ok) return;
      const json = (await res.json()) as { ok?: boolean; data?: Array<{ id: string; diagramId: string; authorId: string; text: string; x: number; y: number; createdAt: string }> };
      if (!json.ok || !Array.isArray(json.data)) return;
      const serverComments: DiagramComment[] = json.data.map((r) => ({
        id: r.id,
        diagramId: r.diagramId,
        author: r.authorId,
        text: r.text,
        x: r.x,
        y: r.y,
        createdAt: new Date(r.createdAt).getTime(),
      }));
      const current = get().comments[diagramId] ?? [];
      // Merge: server wins for same id, keep local-only comments that haven't synced yet
      const serverIds = new Set(serverComments.map((c) => c.id));
      const localOnly = current.filter((c) => !serverIds.has(c.id) && c.id.startsWith("c_"));
      const merged = [...serverComments, ...localOnly];
      const next = { ...get().comments, [diagramId]: merged };
      save(next);
      set({ comments: next });
    } catch {
      // offline — keep local cache
    }
  },

  setOpen: (open) => set({ open }),
  focusComment: (id) => set({ focusedId: id, open: id !== null }),
}));

export function useComments(diagramId: string): DiagramComment[] {
  return useCommentsStore((s) => s.comments[diagramId] ?? EMPTY_COMMENTS);
}

export function currentUser(): string {
  return CURRENT_USER;
}
