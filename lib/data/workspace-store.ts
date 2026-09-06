"use client";

import { create } from "zustand";
import type { Diagram, Project } from "@/types/diagram";
import { storage } from "@/lib/data/storage";

/**
 * Single client-side source of truth for workspace reads.
 *
 * Both the dashboard and the projects page read `projects` / `diagrams`
 * from here — never from a separate server fetch and never from a second
 * client query. Data comes from the same `storage` facade used for all
 * writes, so reads and writes always agree, in PostgreSQL mode and in the
 * localStorage fallback mode (the facade owns the DB health check, the
 * fetch timeout and the offline fallback).
 *
 * After any write (create project, create/delete diagram), call
 * `useWorkspaceStore.getState().reload()` — or `reload()` on the hook —
 * to refresh in place without a full page/server round trip.
 */

interface WorkspaceState {
  projects: Project[];
  diagrams: Diagram[];
  loading: boolean;
  loaded: boolean;
  reload: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  projects: [],
  diagrams: [],
  loading: false,
  loaded: false,

  reload: async (): Promise<void> => {
    if (inflight) return inflight;
    set({ loading: true });
    inflight = (async () => {
      try {
        const [projects, diagrams] = await Promise.all([
          storage.listProjects(),
          storage.listDiagrams(null),
        ]);
        set({ projects, diagrams, loaded: true });
      } catch {
        // Workspace data unavailable — keep existing data (or empty state).
        set({ loaded: true });
      } finally {
        set({ loading: false });
        inflight = null;
      }
    })();
    return inflight;
  },

  deleteProject: async (projectId: string): Promise<void> => {
    // One atomic call in db mode (server cascades diagrams + children);
    // local mode removes the project and its artifacts. Errors propagate
    // so the UI can tell "couldn't delete" from "deleted" — no partial
    // state: the reload below only runs on success.
    await storage.deleteProject(projectId);
    await get().reload();
  },
}));