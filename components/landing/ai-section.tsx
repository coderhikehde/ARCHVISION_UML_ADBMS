"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Database, GitBranch, Languages, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: GitBranch,
    title: "GitHub webhook sync",
    text: "Push, and your class diagram updates itself. Conflicts are surfaced, not silently merged.",
  },
  {
    icon: Database,
    title: "DB schema reflection",
    text: "Point at PostgreSQL, MySQL or SQL Server — or paste a SQL dump — and get a Crow's Foot ER diagram.",
  },
  {
    icon: Languages,
    title: "Four-language codegen",
    text: "TypeScript, Java, Python and C# with framework-aware decorators and builders.",
  },
  {
    icon: ShieldCheck,
    title: "100-point validation",
    text: "Cycles, god classes, detached nodes and naming — checked before anything ships.",
  },
];

export function AISection(): React.ReactElement {
  return (
    <section id="ai" className="relative overflow-hidden py-24 sm:py-32">
      <div className="orb orb-2 right-[-10%] top-[10%] h-[420px] w-[420px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">AI Intelligence</p>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tighter text-foreground sm:text-5xl">
              A copilot that reads architecture, not just text
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
              Every prompt is executed against the parsed AST of your diagram. The AI knows what&apos;s
              selected, what depends on what, and where a change will ripple.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {["Make User inherit from Account", "Add retry() to Payment", "Convert to sequence diagram", "Find god classes"].map(
                (command) => (
                  <span
                    key={command}
                    className="rounded-pill border border-accent-200 bg-accent-soft px-3.5 py-1.5 font-mono text-[12px] text-teal-900"
                  >
                    “{command}”
                  </span>
                )
              )}
            </div>

            <Link href="/login" className="mt-9 inline-block">
              <Button size="lg">
                Start building
                <GitBranch className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-4">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: 32 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1], delay: index * 0.08 }}
                className="card-elevated flex items-start gap-4 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold tracking-tight text-foreground">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{feature.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}