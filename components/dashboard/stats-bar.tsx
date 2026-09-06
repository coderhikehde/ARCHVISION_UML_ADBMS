"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Boxes, Database, FileCode2, GitBranch, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stat {
  icon: LucideIcon;
  label: string;
  value: number | string;
  note: string;
  gradient: string;
}

interface StatsBarProps {
  diagrams: number;
  projects: number;
  templates: number;
  storageMode: "local" | "db";
}

export function StatsBar({ diagrams, projects, templates, storageMode }: StatsBarProps): React.ReactElement {
  const stats: Stat[] = [
    { icon: Boxes, label: "Diagrams", value: diagrams, note: "in your workspace", gradient: "from-blue-600 to-blue-800" },
    { icon: GitBranch, label: "Projects", value: projects, note: "across your workspace", gradient: "from-indigo-500 to-indigo-700" },
    { icon: FileCode2, label: "Templates", value: templates, note: "ready to start from", gradient: "from-emerald-500 to-emerald-700" },
    {
      icon: Database,
      label: "Storage",
      value: storageMode === "db" ? "Server" : "Browser",
      note: storageMode === "db" ? "PostgreSQL — saved server-side" : "local-only — saved on this device",
      gradient: "from-teal-500 to-teal-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: index * 0.06 }}
          className="card-elevated relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <span
            className={cn(
              "absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br opacity-10 transition-opacity duration-300 hover:opacity-20",
              stat.gradient
            )}
            aria-hidden="true"
          />
          <div className="flex items-center justify-between">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            <stat.icon className="h-4 w-4 text-slate-300" />
          </div>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">{stat.value}</p>
          <p className="mt-1 text-[11.5px] font-medium text-muted-foreground">{stat.note}</p>
        </motion.div>
      ))}
    </div>
  );
}
