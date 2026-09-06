"use client";

import * as React from "react";
import {
  LayoutTemplate,
  Save,
  Search,
  Star,
  X,
} from "lucide-react";
import { TEMPLATES, TEMPLATE_CATEGORIES, type EditorTemplate } from "@/lib/architecture/templates";
import { SHAPE_CATEGORIES, searchShapes } from "@/lib/editor/shapes";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

const CATEGORY_LABEL: Record<EditorTemplate["category"], string> = {
  diagram: "Diagrams",
  uml: "UML",
  flow: "Flows",
  planning: "Planning",
};

/** Shared localStorage key — editor-shell writes saved templates here. */
export const MY_TEMPLATES_KEY = "archvision:my-templates";

interface MyTemplate {
  id: string;
  name: string;
  code: string;
}

function loadMyTemplates(): MyTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(MY_TEMPLATES_KEY) ?? "[]") as MyTemplate[];
  } catch {
    return [];
  }
}

/** 48x48 SVG thumbnail with a soft drop shadow, rendered from palette markup. */
function ShapeThumb({ markup }: { markup: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-12 w-12"
      role="img"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export function PaletteSidebar({
  open,
  onClose,
  onApplyTemplate,
  onSaveTemplate,
  mermaidCode,
}: {
  open: boolean;
  onClose: () => void;
  onApplyTemplate: (code: string, name: string) => void;
  onSaveTemplate: (code: string) => void;
  mermaidCode: string;
}): React.ReactElement | null {
  const [tab, setTab] = React.useState<"shapes" | "templates" | "mine">("shapes");
  const [category, setCategory] = React.useState<EditorTemplate["category"]>("uml");
  const [query, setQuery] = React.useState("");
  const [myTemplates, setMyTemplates] = React.useState<MyTemplate[]>([]);

  React.useEffect(() => {
    if (tab === "mine") setMyTemplates(loadMyTemplates());
  }, [tab]);

  React.useEffect(() => {
    if (tab !== "shapes") setQuery("");
  }, [tab]);

  if (!open) return null;

  const templates = TEMPLATES.filter((t) => t.category === category);
  const shapes = searchShapes(query);

  return (
    <aside
      role="complementary"
      aria-label="Shapes palette"
      className="absolute bottom-0 left-0 top-0 z-30 flex w-full max-w-[280px] flex-col border-r border-gray-200 bg-[#F8F9FA]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5">
        <p className="text-[12.5px] font-semibold text-gray-900">Shapes</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close palette"
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex shrink-0 gap-0.5 border-b border-gray-200 bg-white px-3 pb-2 pt-2">
        {(
          [
            ["shapes", "Shapes"],
            ["templates", "Templates"],
            ["mine", "Mine"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors",
              tab === key ? "bg-[#0052CC]/8 text-[#0052CC]" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "shapes" ? (
        <>
          <div className="shrink-0 border-b border-gray-200 bg-[#F8F9FA] p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shapes…"
                aria-label="Search shapes"
                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2 text-[12.5px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#0052CC]"
              />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-gray-400">
              Drag a shape onto the canvas to add it.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {SHAPE_CATEGORIES.map((cat) => {
              const items = shapes.filter((s) => s.category === cat.id);
              if (items.length === 0) return null;
              return (
                <div key={cat.id} className="mb-3">
                  <p className="mb-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {cat.label}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {items.map((shape) => (
                      <button
                        key={`${cat.id}-${shape.kind}-${shape.label}`}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/archvision-node",
                            JSON.stringify({ kind: shape.kind, name: shape.defaultName })
                          );
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="group flex flex-col items-center gap-0.5 rounded-md border border-transparent bg-white px-1 py-1.5 text-center shadow-[0_0_0_1px_rgba(193,199,208,0.35)] transition-all hover:border-[#0052CC] hover:shadow-[0_0_0_1px_#0052CC] active:cursor-grabbing"
                        title={`${shape.label} — drag onto canvas`}
                      >
                        <ShapeThumb markup={shape.thumbnail} />
                        <span className="line-clamp-2 px-0.5 text-[10px] font-medium leading-tight text-gray-700">
                          {shape.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {shapes.length === 0 ? (
              <p className="py-8 text-center text-[11.5px] text-gray-400">No shapes match “{query}”.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === "templates" ? (
        <>
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-gray-200 bg-[#F8F9FA] p-3">
            {TEMPLATE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  category === c ? "bg-[#0052CC] text-white" : "bg-white text-gray-500 hover:text-gray-800"
                )}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    onApplyTemplate(t.build(), t.name);
                    toast("success", `Template “${t.name}” applied`);
                  }}
                  className="w-full rounded-md border border-gray-200 bg-white p-2.5 text-left transition-all hover:border-[#0052CC]"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#0052CC]/8 font-mono text-[12px] text-[#0052CC]">
                      {t.icon}
                    </span>
                    <span className="text-[12px] font-semibold text-gray-900">{t.name}</span>
                  </span>
                  <span className="mt-1 block text-[10.5px] leading-snug text-gray-500">{t.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="shrink-0 border-t border-gray-200 p-3">
            <button
              type="button"
              onClick={() => {
                onSaveTemplate(mermaidCode);
                toast("success", "Current diagram saved as a template");
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 py-2 text-[11.5px] font-medium text-gray-500 transition-colors hover:border-[#0052CC] hover:text-[#0052CC]"
            >
              <Save className="h-3.5 w-3.5" />
              Save current as template
            </button>
          </div>
        </>
      ) : null}

      {tab === "mine" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-[10.5px] text-gray-400">Templates you saved.</p>
          {myTemplates.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-6 text-center">
              <Star className="h-6 w-6 text-gray-300" />
              <p className="text-[11px] text-gray-500">No saved templates yet.</p>
              <p className="max-w-[190px] text-[10px] text-gray-400">
                Use “Save current as template” to keep one.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {myTemplates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onApplyTemplate(t.code, t.name);
                      toast("success", `Template “${t.name}” applied`);
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white p-2.5 text-left transition-all hover:border-[#0052CC]"
                  >
                    <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-[#0052CC]" />
                    <span className="truncate text-[12px] font-semibold text-gray-900">{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </aside>
  );
}
