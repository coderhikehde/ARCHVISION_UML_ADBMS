"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

interface MermaidRendererProps {
  code: string;
  theme?: "light" | "dark";
  fit?: boolean;
  className?: string;
}

const THEME_COLORS = {
  primaryColor: "#2563EB",
  primaryTextColor: "#0F172A",
  primaryBorderColor: "#BFDBFE",
  lineColor: "#94A3B8",
  secondaryColor: "#F8FAFC",
  tertiaryColor: "#CCFBF1",
  clusterBkg: "#F8FAFC",
  clusterBorder: "#E2E8F0",
  edgeLabelBackground: "#FFFFFF",
  fontFamily: "Inter, -apple-system, sans-serif",
  fontSize: "13px",
};

export function MermaidRenderer({ code, className, fit = true }: MermaidRendererProps): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const render = async (): Promise<void> => {
      const container = containerRef.current;
      if (!container) return;
      try {
        const mermaidModule = await import("mermaid");
        mermaidModule.default.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: "base",
          themeVariables: THEME_COLORS,
          flowchart: { htmlLabels: true, curve: "basis" },
          sequence: { mirrorActors: false, actorMargin: 64, messageMargin: 40 },
          er: { useMaxWidth: true },
        });
        const { svg } = await mermaidModule.default.render(`mmd-${Date.now()}`, code);
        if (cancelled) return;
        container.innerHTML = svg;
        const svgEl = container.querySelector("svg");
        if (svgEl) {
          svgEl.setAttribute("class", fit ? "w-full h-auto" : "");
          svgEl.style.maxWidth = "100%";
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    };
    const timer = setTimeout(render, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, fit]);

  return (
    <div className="relative h-full w-full overflow-auto">
      <div ref={containerRef} className={className} />
      {error ? (
        <div className="absolute inset-0 flex items-start justify-center bg-white/80 pt-16 backdrop-blur-sm">
          <div className="flex max-w-md flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
            <p className="text-sm font-semibold text-amber-800">Diagram syntax error</p>
            <p className="text-xs leading-relaxed text-amber-700/80">{error.split("\n")[0]}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}