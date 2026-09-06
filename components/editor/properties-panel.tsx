"use client";

import * as React from "react";
import { Loader2, Sparkles, Trash2, Plus } from "lucide-react";
import type { ArchitectureRelationshipType, ArchitectureNodeKind, Visibility } from "@/types/diagram";
import { VALID_MULTIPLICITIES } from "@/types/diagram";
import {
  defaultAttribute,
  defaultMethod,
  KIND_LABELS,
  methodParametersToString,
  parseMethodParameters,
  VISIBILITY_OPTIONS,
  type NodeEditPatch,
  type RelationshipEditPatch,
} from "@/lib/architecture/editing";
import { describeNode, describeNodeLocal } from "@/lib/ai/describe";
import { CLOUD_SERVICES, PROVIDER_LABELS, serviceIconForStereotype } from "@/lib/architecture/cloud-icons";
import { descendantsOf } from "@/lib/architecture/hierarchy";
import { adrsForNode, useAdrsStore } from "@/lib/editor/adrs";
import { ScrollText } from "lucide-react";
import { RELATION_SPECS_EXTENDED, RELATION_TYPE_ORDER } from "@/lib/editor/relations";
import { cn } from "@/lib/utils";
import { useEditorUI, type DiagramEngine } from "@/hooks/useDiagram";

interface PropertiesPanelProps {
  engine: DiagramEngine;
}

const NODE_KIND_OPTIONS: Array<{ value: ArchitectureNodeKind; label: string }> = [
  "class",
  "abstract",
  "interface",
  "entity",
  "controller",
  "service",
  "repository",
  "component",
  "actor",
  "database",
  "api",
  "event",
].map((kind) => ({ value: kind as ArchitectureNodeKind, label: KIND_LABELS[kind as ArchitectureNodeKind] }));

const RELATION_TYPE_OPTIONS = RELATION_TYPE_ORDER.map((type) => ({
  value: type,
  label: RELATION_SPECS_EXTENDED[type].label,
}));

const FILL_SWATCHES = [
  "#FFFFFF",
  "#EFF6FF",
  "#F0FDF4",
  "#FFFBEB",
  "#FDF2F8",
  "#F8FAFC",
  "#ECFEFF",
  "#FEF2F2",
  "#FAF5FF",
];

const BORDER_SWATCHES = [
  "#5E6C84",
  "#0052CC",
  "#059669",
  "#D97706",
  "#DB2777",
  "#475569",
  "#0891B2",
  "#DC2626",
  "#7C3AED",
];

const EDGE_COLOR_SWATCHES = [
  "#5E6C84",
  "#0052CC",
  "#059669",
  "#D97706",
  "#DB2777",
  "#475569",
  "#0891B2",
  "#DC2626",
  "#7C3AED",
];

const ROUTING_OPTIONS = [
  { value: "orthogonal", label: "Orthogonal" },
  { value: "curved", label: "Curved" },
  { value: "straight", label: "Straight" },
];

function Select({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}): React.ReactElement {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-lg border border-line bg-white px-2 text-[12px] font-medium text-foreground outline-none transition-colors focus:border-primary/60"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}): React.ReactElement {
  return (
    <input
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-lg border border-line bg-white px-2 text-[12px] font-medium text-foreground outline-none transition-colors focus:border-primary/60"
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="mt-4 mb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">{children}</p>
  );
}

/** Read-only chips for ADRs bound to this node; opens the ADR panel on demand. */
function NodeAdrChips({ diagramId, nodeName }: { diagramId: string; nodeName: string }): React.ReactElement | null {
  const adrs = useAdrsStore((s) => s.adrs);
  const setAdrsOpen = useEditorUI((s) => s.setAdrsOpen);
  const linked = adrsForNode(adrs, diagramId, nodeName);
  if (linked.length === 0) return null;
  return (
    <div className="mt-3 space-y-1">
      {linked.map((adr) => (
        <button
          key={adr.id}
          type="button"
          onClick={() => setAdrsOpen(true)}
          className="flex w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 text-left text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          title="Open architecture decisions"
        >
          <ScrollText className="h-3 w-3 shrink-0" />
          <span className="truncate">
            ADR {adr.number}. {adr.title}
          </span>
        </button>
      ))}
    </div>
  );
}

function NodeEditor({ engine }: { engine: DiagramEngine }): React.ReactElement | null {
  const node = engine.architecture.nodes.find((n) => n.id === engine.selectedNodeId);
  const [describing, setDescribing] = React.useState(false);
  const [describeMode, setDescribeMode] = React.useState<"online" | "offline" | null>(null);
  if (!node) return null;

  const patch = (p: NodeEditPatch): void => {
    engine.updateNode(node.id, p);
  };

  const generateDescription = async (): Promise<void> => {
    setDescribing(true);
    try {
      const result = await describeNode(node, engine.architecture);
      patch({ notes: [result.text] });
      setDescribeMode(result.mode);
    } catch {
      patch({ notes: [describeNodeLocal(node, engine.architecture)] });
      setDescribeMode("offline");
    } finally {
      setDescribing(false);
    }
  };

  const setAttributes = (attributes: typeof node.attributes): void => patch({ attributes: attributes.map((a) => ({ ...a })) });
  const setMethods = (methods: typeof node.methods): void => patch({ methods: methods.map((m) => ({ ...m })) });

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-foreground">Node properties</p>
        <button
          type="button"
          onClick={() => engine.removeNode(node.id)}
          className="flex items-center gap-1 rounded-lg border border-error/20 bg-error/5 px-2 py-1 text-[11px] font-semibold text-error transition-colors hover:bg-error/10"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>

      <SectionLabel>Identity</SectionLabel>
      <NodeAdrChips diagramId={engine.diagramId} nodeName={node.name} />
      <div className="space-y-2">
        <TextInput
          ariaLabel="Node name"
          value={node.name}
          onChange={(v) => patch({ name: v.trim() ? v : node.name })}
          placeholder="Name"
        />
        <Select
          ariaLabel="Node kind"
          value={node.kind}
          onChange={(v) => patch({ kind: v as ArchitectureNodeKind })}
          options={NODE_KIND_OPTIONS}
        />
        <TextInput
          ariaLabel="Stereotype"
          value={node.stereotype ?? ""}
          onChange={(v) => patch({ stereotype: v.trim() ? v : null })}
          placeholder="Stereotype (e.g. entity, service)"
        />
        <Select
          ariaLabel="Contained in"
          value={node.parentId ?? ""}
          onChange={(v) => patch({ parentId: v || null })}
          options={[
            { value: "", label: "Top level (no container)" },
            ...engine.architecture.nodes
              .filter(
                (n) =>
                  n.id !== node.id &&
                  !descendantsOf(engine.architecture, node.id).some((d) => d.id === n.id)
              )
              .map((n) => ({ value: n.id, label: n.name })),
          ]}
        />
        <div>
          <p className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Cloud service icon
          </p>
          <div className="grid grid-cols-2 gap-1" role="listbox" aria-label="Cloud service icon">
            {CLOUD_SERVICES.map((service) => {
              const active = serviceIconForStereotype(node.stereotype)?.id === service.id;
              const Glyph = service.icon;
              return (
                <button
                  key={service.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  title={`${PROVIDER_LABELS[service.provider]} · ${service.label}`}
                  onClick={() => patch({ stereotype: active ? null : service.id })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[10.5px] font-semibold transition-colors",
                    active
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-line bg-white text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                    style={{ backgroundColor: `${service.color}1A` }}
                  >
                    <Glyph className="h-3 w-3" style={{ color: service.color }} aria-hidden />
                  </span>
                  <span className="truncate">{service.label}</span>
                </button>
              );
            })}
          </div>
          {node.stereotype && !serviceIconForStereotype(node.stereotype) ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              “{node.stereotype}” is a custom stereotype — pick a service above to give it an icon.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <SectionLabel>Description</SectionLabel>
        <button
          type="button"
          onClick={() => void generateDescription()}
          disabled={describing}
          className="mb-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
        >
          {describing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          AI describe
        </button>
      </div>
      <textarea
        aria-label="Node description"
        value={node.notes[0] ?? ""}
        onChange={(e) => patch({ notes: [e.target.value] })}
        placeholder="Describe this node's responsibility…"
        rows={3}
        className="h-auto w-full resize-y rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] font-medium text-foreground outline-none transition-colors focus:border-primary/60"
      />
      {describeMode ? (
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          {describeMode === "online" ? "Generated with GPT-4o / Claude" : "Offline mode — ArchVision's local extraction engine"}
        </p>
      ) : null}

      <SectionLabel>Style</SectionLabel>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fill</p>
          <div className="flex flex-wrap gap-1.5">
            {FILL_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Fill ${c}`}
                onClick={() => patch({ style: { ...node.style, fill: c === "#FFFFFF" ? undefined : c } })}
                className={cn(
                  "h-6 w-6 rounded-md border border-line transition-transform hover:scale-110",
                  node.style?.fill === c && "ring-2 ring-primary/50"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Border</p>
          <div className="flex flex-wrap gap-1.5">
            {BORDER_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Border ${c}`}
                onClick={() => patch({ style: { ...node.style, border: c === "#5E6C84" ? undefined : c } })}
                className={cn(
                  "h-6 w-6 rounded-md border border-line transition-transform hover:scale-110",
                  node.style?.border === c && "ring-2 ring-primary/50"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Font size</p>
          <select
            aria-label="Font size"
            value={node.style?.fontSize ?? 13}
            onChange={(e) => patch({ style: { ...node.style, fontSize: Number(e.target.value) } })}
            className="h-8 w-full rounded-lg border border-line bg-white px-2 text-[12px] font-medium text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {[12, 13, 14, 15, 16].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <label className={cn("flex items-center gap-1.5 text-[11.5px] font-medium text-foreground", node.isInterface && "text-sky-600")}>
          <input
            type="checkbox"
            checked={node.isInterface}
            onChange={(e) => patch({ isInterface: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          Interface
        </label>
        <label className={cn("flex items-center gap-1.5 text-[11.5px] font-medium text-foreground", node.isAbstract && "text-teal-700")}>
          <input
            type="checkbox"
            checked={node.isAbstract}
            onChange={(e) => patch({ isAbstract: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          Abstract
        </label>
      </div>

      <div className="flex items-center justify-between">
        <SectionLabel>Attributes</SectionLabel>
        <button
          type="button"
          onClick={() => setAttributes([...node.attributes, defaultAttribute(`field${node.attributes.length + 1}`)])}
          className="mb-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-1.5">
        {node.attributes.map((attr, index) => (
          <div key={`${attr.name}-${index}`} className="flex items-center gap-1.5">
            <Select
              ariaLabel={`Attribute ${attr.name} visibility`}
              value={attr.visibility}
              onChange={(v) => {
                const next = [...node.attributes];
                next[index] = { ...next[index], visibility: v as Visibility };
                setAttributes(next);
              }}
              options={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.symbol }))}
            />
            <TextInput
              ariaLabel={`Attribute ${index + 1} name`}
              value={attr.name}
              onChange={(v) => {
                const next = [...node.attributes];
                next[index] = { ...next[index], name: v.trim() ? v : next[index].name };
                setAttributes(next);
              }}
            />
            <TextInput
              ariaLabel={`Attribute ${index + 1} type`}
              value={attr.type}
              onChange={(v) => {
                const next = [...node.attributes];
                next[index] = { ...next[index], type: v.trim() ? v : "string" };
                setAttributes(next);
              }}
            />
            <button
              type="button"
              aria-label={`Remove attribute ${attr.name}`}
              onClick={() => setAttributes(node.attributes.filter((_, i) => i !== index))}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-error/10 hover:text-error"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {node.attributes.length === 0 ? (
          <p className="text-[11px] text-slate-400">No attributes</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <SectionLabel>Methods</SectionLabel>
        <button
          type="button"
          onClick={() => setMethods([...node.methods, defaultMethod(`method${node.methods.length + 1}`)])}
          className="mb-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-1.5">
        {node.methods.map((method, index) => (
          <div key={`${method.name}-${index}`} className="space-y-1.5 rounded-lg border border-line p-1.5">
            <div className="flex items-center gap-1.5">
              <Select
                ariaLabel={`Method ${method.name} visibility`}
                value={method.visibility}
                onChange={(v) => {
                  const next = [...node.methods];
                  next[index] = { ...next[index], visibility: v as Visibility };
                  setMethods(next);
                }}
                options={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.symbol }))}
              />
              <TextInput
                ariaLabel={`Method ${index + 1} name`}
                value={method.name}
                onChange={(v) => {
                  const next = [...node.methods];
                  next[index] = { ...next[index], name: v.trim() ? v : next[index].name };
                  setMethods(next);
                }}
              />
              <button
                type="button"
                aria-label={`Remove method ${method.name}`}
                onClick={() => setMethods(node.methods.filter((_, i) => i !== index))}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="flex gap-1.5">
              <TextInput
                ariaLabel={`Method ${method.name} parameters`}
                value={methodParametersToString(method.parameters)}
                onChange={(v) => {
                  const next = [...node.methods];
                  next[index] = { ...next[index], parameters: parseMethodParameters(v) };
                  setMethods(next);
                }}
                placeholder="arg: string, id: number"
              />
              <TextInput
                ariaLabel={`Method ${method.name} return type`}
                value={method.returnType}
                onChange={(v) => {
                  const next = [...node.methods];
                  next[index] = { ...next[index], returnType: v.trim() ? v : "void" };
                  setMethods(next);
                }}
                placeholder="void"
              />
            </div>
          </div>
        ))}
        {node.methods.length === 0 ? (
          <p className="text-[11px] text-slate-400">No methods</p>
        ) : null}
      </div>
    </div>
  );
}

function EdgeEditor({ engine }: { engine: DiagramEngine }): React.ReactElement | null {
  const edge = engine.architecture.relationships.find((r) => r.id === engine.selectedEdgeId);
  if (!edge) return null;

  const patch = (p: RelationshipEditPatch): void => {
    engine.updateRelationship(edge.id, p);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-foreground">Relationship properties</p>
        <button
          type="button"
          onClick={() => engine.removeRelationship(edge.id)}
          className="flex items-center gap-1 rounded-lg border border-error/20 bg-error/5 px-2 py-1 text-[11px] font-semibold text-error transition-colors hover:bg-error/10"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>

      <p className="mt-2 truncate rounded-lg bg-surface px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
        {edge.source} <span className="text-slate-400">→</span> {edge.target}
      </p>

      <SectionLabel>Type</SectionLabel>
      <Select
        ariaLabel="Relationship type"
        value={edge.type}
        onChange={(v) => patch({ type: v as ArchitectureRelationshipType })}
        options={RELATION_TYPE_OPTIONS}
      />

      <SectionLabel>Label</SectionLabel>
      <TextInput
        ariaLabel="Relationship label"
        value={edge.label ?? ""}
        onChange={(v) => patch({ label: v.trim() ? v : null })}
        placeholder="e.g. owns, depends, has"
      />

      <SectionLabel>Role names</SectionLabel>
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Source</p>
          <TextInput
            ariaLabel="Source role"
            value={edge.sourceRole ?? ""}
            onChange={(v) => patch({ sourceRole: v.trim() ? v : null })}
            placeholder="e.g. owner"
          />
        </div>
        <div className="flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Target</p>
          <TextInput
            ariaLabel="Target role"
            value={edge.targetRole ?? ""}
            onChange={(v) => patch({ targetRole: v.trim() ? v : null })}
            placeholder="e.g. owned"
          />
        </div>
      </div>

      <SectionLabel>Line style</SectionLabel>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {EDGE_COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Edge color ${c}`}
                onClick={() => patch({ style: { ...edge.style, color: c === "#5E6C84" ? undefined : c } })}
                className={cn(
                  "h-6 w-6 rounded-md border border-line transition-transform hover:scale-110",
                  (edge.style?.color ?? "#5E6C84") === c && "ring-2 ring-primary/50"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Width</p>
            <select
              aria-label="Edge width"
              value={edge.style?.width ?? 1.5}
              onChange={(e) => patch({ style: { ...edge.style, width: Number(e.target.value) } })}
              className="h-8 w-full rounded-lg border border-line bg-white px-2 text-[12px] font-medium text-foreground outline-none transition-colors focus:border-primary/60"
            >
              {[1, 1.5, 2, 2.5, 3, 4].map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Routing</p>
            <Select
              ariaLabel="Edge routing"
              value={edge.style?.routing ?? "orthogonal"}
              onChange={(v) => patch({ style: { ...edge.style, routing: v as "orthogonal" | "straight" | "curved" } })}
              options={ROUTING_OPTIONS}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11.5px] font-medium text-foreground">
          <input
            type="checkbox"
            checked={edge.style?.dash === "5 5"}
            onChange={(e) => patch({ style: { ...edge.style, dash: e.target.checked ? "5 5" : undefined } })}
            className="h-3.5 w-3.5 accent-primary"
          />
          Dashed line
        </label>
      </div>

      <SectionLabel>Multiplicities</SectionLabel>
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Source</p>
          <Select
            ariaLabel="Source multiplicity"
            value={edge.sourceMultiplicity}
            onChange={(v) => patch({ sourceMultiplicity: v })}
            options={Array.from(VALID_MULTIPLICITIES).map((m) => ({ value: m, label: m }))}
          />
        </div>
        <div className="flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Target</p>
          <Select
            ariaLabel="Target multiplicity"
            value={edge.targetMultiplicity}
            onChange={(v) => patch({ targetMultiplicity: v })}
            options={Array.from(VALID_MULTIPLICITIES).map((m) => ({ value: m, label: m }))}
          />
        </div>
      </div>

      <p className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-slate-400">
        Saved as Mermaid: {edge.source} {edge.sourceMultiplicity !== "1" ? `"${edge.sourceMultiplicity}" ` : ""}
        {RELATION_SPECS_EXTENDED[edge.type]?.mermaid ?? "-->"}
        {edge.targetMultiplicity !== "1" ? ` "${edge.targetMultiplicity}"` : ""}
        {edge.label ? ` : ${edge.label}` : ""}
      </p>
    </div>
  );
}

export function PropertiesPanel({ engine }: PropertiesPanelProps): React.ReactElement | null {
  const hasSelection = engine.selectedNodeId !== null || engine.selectedEdgeId !== null;
  if (!hasSelection) return null;
  return (
    <aside
      role="complementary"
      aria-label="Properties panel"
      className="absolute bottom-0 right-0 top-0 z-30 flex w-[320px] flex-col overflow-y-auto border-l border-line bg-white/95 shadow-panel-float backdrop-blur"
    >
      {engine.selectedNodeId !== null ? <NodeEditor engine={engine} /> : null}
      {engine.selectedEdgeId !== null ? <EdgeEditor engine={engine} /> : null}
    </aside>
  );
}