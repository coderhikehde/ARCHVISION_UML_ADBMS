"use client";

export function C4GroupNode({ data }: { data: { label: string; childCount: number } }) {
  return (
    <div className="h-full w-full rounded-xl border-2 border-dashed border-primary/20 bg-primary/[0.04] p-0">
      <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/[0.06] px-3 py-1.5 rounded-t-xl">
        <div className="h-2 w-2 rounded-full bg-primary/40" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-primary/70">{data.label}</span>
        <span className="ml-auto text-[10px] font-semibold text-primary/50">{data.childCount} items</span>
      </div>
    </div>
  );
}

export default C4GroupNode;
