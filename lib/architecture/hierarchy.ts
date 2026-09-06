import type { Architecture, ArchitectureNode } from "@/types/diagram";

/**
 * C4 hierarchy helpers (Epic 2) — pure functions over the canonical
 * Architecture model. Containment is expressed with `parentId`, which
 * round-trips through Mermaid `namespace` blocks.
 *
 * Drill-down is a VIEW over one flat model: focusing a container shows
 * only its descendants and the edges between them. No sub-diagrams, no
 * extra persistence — the full model stays the single source of truth.
 */

/** Direct children of `nodeId` (empty for leaves). */
export function childrenOf(arch: Architecture, nodeId: string): ArchitectureNode[] {
  return arch.nodes.filter((n) => n.parentId === nodeId);
}

/** True when the node has at least one child — drill-down affordance gate. */
export function canDrillInto(arch: Architecture, nodeId: string | null | undefined): boolean {
  if (!nodeId) return false;
  return arch.nodes.some((n) => n.parentId === nodeId);
}

/** All descendants (transitive children), excluding the node itself. */
export function descendantsOf(arch: Architecture, nodeId: string): ArchitectureNode[] {
  const out: ArchitectureNode[] = [];
  const queue = [nodeId];
  const seen = new Set<string>(queue);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const node of arch.nodes) {
      if (node.parentId === current && !seen.has(node.id)) {
        seen.add(node.id);
        out.push(node);
        queue.push(node.id);
      }
    }
  }
  return out;
}

/** Chain from the top-level ancestor down to the node itself — breadcrumb order. */
export function ancestorChain(arch: Architecture, nodeId: string): ArchitectureNode[] {
  const chain: ArchitectureNode[] = [];
  let cursor = arch.nodes.find((n) => n.id === nodeId) ?? null;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? arch.nodes.find((n) => n.id === cursor!.parentId) ?? null : null;
  }
  return chain;
}

/**
 * The architecture as seen from a focus point:
 *   - focus null → the whole model unchanged
 *   - focus set  → the focused container + all descendants; relationships
 *     are kept only when BOTH endpoints are visible.
 * Returns a shallow copy — never mutates the input.
 */
export function focusArchitecture(arch: Architecture, focusId: string | null): Architecture {
  if (!focusId) return arch;
  const focusNode = arch.nodes.find((n) => n.id === focusId);
  if (!focusNode) return arch;
  const visibleIds = new Set<string>([focusId, ...descendantsOf(arch, focusId).map((n) => n.id)]);
  return {
    ...arch,
    nodes: arch.nodes.filter((n) => visibleIds.has(n.id)),
    relationships: arch.relationships.filter(
      (r) => visibleIds.has(r.source) && visibleIds.has(r.target)
    ),
  };
}