"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, FileCode2, Sparkles } from "lucide-react";
import { GithubIcon } from "@/components/ui/brand-icons";
import { cn } from "@/lib/utils";

interface WorkflowStep {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  step: string;
  title: string;
  text: string;
}

const STEPS: WorkflowStep[] = [
  {
    icon: Sparkles,
    iconClass: "from-blue-500 to-blue-900 shadow-blue-500/30",
    step: "Step 01",
    title: "Describe your system",
    text: "Paste natural language, a codebase, or a SQL dump. ArchVision extracts classes, methods, attributes and cardinalities.",
  },
  {
    icon: GithubIcon,
    iconClass: "from-slate-600 to-slate-900 shadow-slate-700/30",
    step: "Step 02",
    title: "Connect & reflect",
    text: "Link a GitHub repository or database. Your real architecture is reflected into the diagram and kept in sync.",
  },
  {
    icon: FileCode2,
    iconClass: "from-teal-500 to-teal-700 shadow-teal-500/30",
    step: "Step 03",
    title: "Refine, validate & ship",
    text: "Edit via AI prompts, run the architecture critic, then generate code in four languages and export anywhere.",
  },
];

export function Workflow(): React.ReactElement {
  return (
    <section id="workflow" className="border-y border-line bg-surface/40 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Workflow</p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-tighter text-foreground sm:text-5xl">
            From idea to artifact in three moves
          </h2>
        </div>
        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1], delay: index * 0.08 }}
              className="relative"
            >
              {index < STEPS.length - 1 ? (
                <ArrowRight
                  className="absolute -right-4 top-10 z-10 hidden h-5 w-5 text-slate-300 lg:block"
                  aria-hidden="true"
                />
              ) : null}
              <div className="card-elevated relative h-full overflow-hidden p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover">
                <span
                  className="absolute right-5 top-4 text-4xl font-extrabold tracking-tighter text-slate-100"
                  aria-hidden="true"
                >
                  {`0${index + 1}`}
                </span>
                <div
                  className={cn(
                    "mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
                    step.iconClass
                  )}
                >
                  <step.icon className="h-6 w-6" />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{step.step}</p>
                <h3 className="mt-2 text-xl font-extrabold tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{step.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}