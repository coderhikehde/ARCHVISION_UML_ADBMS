"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartVertical,
  ArrowLeftRight,
  Bot,
  ChevronDown,
  ChevronLeft,
  Clipboard,
  ClipboardList,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileText,
  FileUp,
  History,
  Maximize,
  MessageSquare,
  Minus,
  MoveDown,
  MoveRight,
  PanelLeft,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  ScanSearch,
  Scissors,
  ScrollText,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiagramType, ViewMode } from "@/types/diagram";
import type { DiagramEngine } from "@/hooks/useDiagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useEditorUI } from "@/hooks/useDiagram";

interface ToolbarProps {
  diagramName: string;
  diagramType: DiagramType;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  validationScore: number | null;
  isValid: boolean;
  onExport: (format: string) => void;
  codePanelOpen: boolean;
  onToggleCodePanel: () => void;
  paletteOpen: boolean;
  onTogglePalette: () => void;
  engine: DiagramEngine;
  commentCount: number;
}

const ALIGN_ITEMS: Array<{ axis: "left" | "center" | "right" | "top" | "middle" | "bottom"; label: string; icon: React.ReactNode }> = [
  { axis: "left", label: "Align left", icon: <AlignLeft className="h-3.5 w-3.5" /> },
  { axis: "center", label: "Align center (h)", icon: <AlignCenter className="h-3.5 w-3.5" /> },
  { axis: "right", label: "Align right", icon: <AlignRight className="h-3.5 w-3.5" /> },
  { axis: "top", label: "Align top", icon: <AlignStartVertical className="h-3.5 w-3.5" /> },
  { axis: "middle", label: "Align middle (v)", icon: <AlignEndVertical className="h-3.5 w-3.5" /> },
  { axis: "bottom", label: "Align bottom", icon: <AlignEndHorizontal className="h-3.5 w-3.5" /> },
];

const dispatch = (name: string, detail?: Record<string, unknown>): void => {
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

export function Toolbar({
  diagramName,
  diagramType,
  viewMode,
  onViewModeChange,
  validationScore,
  isValid,
  onExport,
  codePanelOpen,
  onToggleCodePanel,
  paletteOpen,
  onTogglePalette,
  engine,
  commentCount,
}: ToolbarProps): React.ReactElement {
  const router = useRouter();
  const { setSidePanel, setAnalysisOpen, setCodeGenOpen, setDocsOpen, setVersionOpen, setShareOpen, setReportOpen, setAiGenerateOpen, setImportOpen, setCheatSheetOpen, setAdrsOpen, adrsOpen } = useEditorUI();
  const [exportOpen, setExportOpen] = React.useState(false);
  const [fileOpen, setFileOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [arrangeOpen, setArrangeOpen] = React.useState(false);
  const [aiMenuOpen, setAiMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (): void => setExportOpen(true);
    window.addEventListener("archvision:export-menu", handler);
    return () => window.removeEventListener("archvision:export-menu", handler);
  }, []);

  const exportFormats = [
    { id: "svg", label: "SVG (vector)", hint: "Best for embedding & editing" },
    { id: "png", label: "PNG (2x)", hint: "Crisp raster, any viewer" },
    { id: "pdf", label: "PDF report", hint: "Vector document" },
    { id: "plantuml", label: "PlantUML", hint: "Source code export" },
    { id: "mermaid", label: "Mermaid (.mmd)", hint: "Portable source" },
    { id: "json", label: "JSON model", hint: "Machine-readable AST" },
    { id: "xmi", label: "XMI (UML 2.5)", hint: "StarUML / Papyrus interchange" },
    { id: "sql", label: "SQL (DDL)", hint: "Tables + foreign keys" },
  ];

  const menuTrigger = (label: string, open: boolean): React.ReactNode => (
    <span className="flex items-center gap-1 px-2 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded">
      {label}
      <ChevronDown className={cn("h-3 w-3 text-gray-400 transition-transform", open && "rotate-180")} />
    </span>
  );

  const iconAction = (label: string, onClick: () => void, icon: React.ReactNode, active = false): React.ReactNode => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className={cn("h-8 w-8 rounded-md", active && "border border-primary/30 bg-primary/5 text-primary")}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex h-12 select-none items-center justify-between gap-2 overflow-x-auto border-b border-gray-200 bg-white px-4">
      {/* LEFT ZONE — back, diagram identity, File/Edit/View/Arrange */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          aria-label="Back to dashboard"
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="h-6 w-px bg-gray-200" />
        <span className="max-w-[180px] truncate text-[13.5px] font-semibold text-gray-900" title={diagramName}>
          {diagramName}
        </span>
        <Badge variant="soft-blue" className="shrink-0 text-xs font-medium">
          {diagramType.toLowerCase()} diagram
        </Badge>
        {validationScore !== null ? (
          <Badge variant={isValid ? "success" : "warning"} className="shrink-0">
            {validationScore}/100
          </Badge>
        ) : null}
        <div className="h-6 w-px bg-gray-200" />

        <DropdownMenu open={fileOpen} onOpenChange={setFileOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded hover:bg-gray-50" aria-label="File menu">
              {menuTrigger("File", fileOpen)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => router.push("/dashboard?new=1")}>
              <Plus className="h-3.5 w-3.5 text-gray-400" /> New Diagram
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <FileUp className="h-3.5 w-3.5 text-gray-400" /> Open… (Import)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport("mermaid")}>
              <Download className="h-3.5 w-3.5 text-gray-400" /> Save (.mmd)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("json")}>
              <FileText className="h-3.5 w-3.5 text-gray-400" /> Save As… (JSON model)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Share2 className="h-3.5 w-3.5 text-gray-400" /> Share…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 text-gray-400" /> Print
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={editOpen} onOpenChange={setEditOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded hover:bg-gray-50" aria-label="Edit menu">
              {menuTrigger("Edit", editOpen)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem disabled={!engine.canUndo} onClick={() => engine.undo()}>
              <Undo2 className="h-3.5 w-3.5 text-gray-400" /> Undo
              <span className="ml-auto text-[10px] text-gray-400">Ctrl Z</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!engine.canRedo} onClick={() => engine.redo()}>
              <Redo2 className="h-3.5 w-3.5 text-gray-400" /> Redo
              <span className="ml-auto text-[10px] text-gray-400">Ctrl Shift Z</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => dispatch("archvision:duplicate-selected")}>
              <Copy className="h-3.5 w-3.5 text-gray-400" /> Duplicate
              <span className="ml-auto text-[10px] text-gray-400">Ctrl D</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:copy-selected")}>
              <Clipboard className="h-3.5 w-3.5 text-gray-400" /> Copy
              <span className="ml-auto text-[10px] text-gray-400">Ctrl C</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:cut-selected")}>
              <Scissors className="h-3.5 w-3.5 text-gray-400" /> Cut
              <span className="ml-auto text-[10px] text-gray-400">Ctrl X</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:paste")}>
              <Clipboard className="h-3.5 w-3.5 text-gray-400" /> Paste
              <span className="ml-auto text-[10px] text-gray-400">Ctrl V</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:select-all")}>
              <Maximize className="h-3.5 w-3.5 text-gray-400" /> Select all
              <span className="ml-auto text-[10px] text-gray-400">Ctrl A</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:delete-selected")}>
              <Trash2 className="h-3.5 w-3.5 text-gray-400" /> Delete
              <span className="ml-auto text-[10px] text-gray-400">Del</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={viewOpen} onOpenChange={setViewOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded hover:bg-gray-50" aria-label="View menu">
              {menuTrigger("View", viewOpen)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => dispatch("archvision:fit-view")}>
              <Maximize className="h-3.5 w-3.5 text-gray-400" /> Fit to screen
              <span className="ml-auto text-[10px] text-gray-400">Ctrl F</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:zoom-in")}>
              <ZoomIn className="h-3.5 w-3.5 text-gray-400" /> Zoom in
              <span className="ml-auto text-[10px] text-gray-400">Ctrl +</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:zoom-out")}>
              <Minus className="h-3.5 w-3.5 text-gray-400" /> Zoom out
              <span className="ml-auto text-[10px] text-gray-400">Ctrl -</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:zoom-reset")}>
              <RotateCcw className="h-3.5 w-3.5 text-gray-400" /> Reset zoom
              <span className="ml-auto text-[10px] text-gray-400">Ctrl 0</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleCodePanel}>
              <Code2 className="h-3.5 w-3.5 text-gray-400" /> Toggle code panel
              <span className="ml-auto text-[10px] text-gray-400">Ctrl E</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCheatSheetOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 text-gray-400" /> Shortcuts
              <span className="ml-auto text-[10px] text-gray-400">Ctrl ?</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={arrangeOpen} onOpenChange={setArrangeOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded hover:bg-gray-50" aria-label="Arrange menu">
              {menuTrigger("Arrange", arrangeOpen)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Align</DropdownMenuLabel>
            {ALIGN_ITEMS.map((item) => (
              <DropdownMenuItem key={item.axis} onClick={() => dispatch("archvision:align", { axis: item.axis })}>
                {item.icon} {item.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Distribute</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => dispatch("archvision:distribute", { axis: "horizontal" })}>
              <AlignHorizontalDistributeCenter className="h-3.5 w-3.5 text-gray-400" /> Evenly (horizontal)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:distribute", { axis: "vertical" })}>
              <AlignVerticalDistributeCenter className="h-3.5 w-3.5 text-gray-400" /> Evenly (vertical)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Auto Layout</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => dispatch("archvision:auto-layout", { direction: "LR" })}>
              <MoveRight className="h-3.5 w-3.5 text-gray-400" /> Left → Right
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => dispatch("archvision:auto-layout", { direction: "TB" })}>
              <MoveDown className="h-3.5 w-3.5 text-gray-400" /> Top → Bottom
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => dispatch("archvision:reorder-participants")}>
              <ArrowLeftRight className="h-3.5 w-3.5 text-gray-400" /> Reorder Participants (by message flow)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* CENTER ZONE — undo/redo + view mode */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => engine.undo()} disabled={!engine.canUndo} aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => engine.redo()} disabled={!engine.canRedo} aria-label="Redo">
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl Shift Z)</TooltipContent>
        </Tooltip>
        <div className="mx-1 h-6 w-px bg-gray-200" />
        <div className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-0.5">
          {(["EXECUTIVE", "ENGINEERING"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewModeChange(mode)}
              className={cn(
                "rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                viewMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
              aria-pressed={viewMode === mode}
            >
              {mode === "EXECUTIVE" ? "Executive" : "Engineering"}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT ZONE — tools, export, generate, AI assistant */}
      <div className="flex items-center gap-1.5">
        {iconAction("Shape palette (Ctrl B)", onTogglePalette, <PanelLeft className="h-4 w-4" />, paletteOpen)}
        {iconAction("UML validation", () => setSidePanel("validation"), <ShieldCheck className="h-4 w-4" />)}
        {iconAction("Architecture analysis", () => setAnalysisOpen(true), <ScanSearch className="h-4 w-4" />)}
        {iconAction("Generate source code", () => setCodeGenOpen(true), <FileCode2 className="h-4 w-4" />)}
        {iconAction("Design docs", () => setDocsOpen(true), <FileText className="h-4 w-4" />)}
        {iconAction("Version history", () => setVersionOpen(true), <History className="h-4 w-4" />)}
        {iconAction("Toggle code panel", onToggleCodePanel, <Code2 className="h-4 w-4" />, codePanelOpen)}
        {iconAction("Share diagram", () => setShareOpen(true), <Share2 className="h-4 w-4" />)}
        {iconAction("Comments", () => useEditorUI.getState().setCommentsOpen(true), <MessageSquare className="h-4 w-4" />, commentCount > 0)}
        {iconAction("Generate report", () => setReportOpen(true), <ClipboardList className="h-4 w-4" />)}
        {iconAction("Architecture decisions (ADR)", () => setAdrsOpen(true), <ScrollText className="h-4 w-4" />, adrsOpen)}
        <div className="h-6 w-px bg-gray-200" />

        <DropdownMenu open={exportOpen} onOpenChange={setExportOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Export diagram</DropdownMenuLabel>
            {exportFormats.map((format) => (
              <DropdownMenuItem key={format.id} onClick={() => onExport(format.id)}>
                <span className="flex w-full items-center justify-between">
                  <span className="font-medium">{format.label}</span>
                  <span className="text-xs text-gray-400">{format.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport("json")}>
              <span className="text-xs text-gray-400">Share as JSON link</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center">
          <Button
            size="sm"
            onClick={() => setSidePanel("ai")}
            aria-label="AI Assist — chat to edit this diagram"
            className="rounded-r-none"
          >
            <Bot className="h-4 w-4" />
            AI Assist
          </Button>
          <DropdownMenu open={aiMenuOpen} onOpenChange={setAiMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                aria-label="More AI actions"
                className="rounded-l-none border-l border-white/25 px-2"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>AI actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setSidePanel("ai")}>
                <Bot className="h-3.5 w-3.5 text-gray-400" />
                <span className="flex flex-col">
                  <span className="font-medium">AI Assist</span>
                  <span className="text-[11px] text-muted-foreground">Chat to edit the current diagram</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAiGenerateOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 text-gray-400" />
                <span className="flex flex-col">
                  <span className="font-medium">Generate new diagram…</span>
                  <span className="text-[11px] text-muted-foreground">Start fresh from a description</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
