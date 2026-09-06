"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play, Sparkles, Wand2, Workflow, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PreviewCard } from "@/components/landing/preview-card";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const, delay },
  }),
};

export function Hero({ authed = false }: { authed?: boolean }): React.ReactElement {
  return (
    <section className="relative overflow-hidden pb-24 pt-32 sm:pt-40">
      <div className="absolute inset-0 opacity-100">
        <div className="orb orb-1 -top-24 left-[8%] h-[420px] w-[420px]" />
        <div className="orb orb-2 top-[20%] right-[5%] h-[380px] w-[380px]" />
        <div className="orb orb-3 bottom-[-10%] left-[40%] h-[360px] w-[360px]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-white to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div variants={fadeUp} custom={0} initial="hidden" animate="visible">
            <Badge variant="accent" className="mb-6 gap-2 px-4 py-1.5 text-[11px]">
              <Sparkles className="h-3 w-3" />
              From plain language to production-ready UML
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={0.08}
            initial="hidden"
            animate="visible"
            className="text-5xl font-extrabold leading-[1.05] tracking-[-2px] text-foreground sm:text-6xl lg:text-7xl"
          >
            Turn words into{" "}
            <span className="bg-gradient-to-r from-primary via-primary-deep to-accent bg-clip-text text-transparent">
              production-ready
            </span>{" "}
            UML diagrams
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={0.16}
            initial="hidden"
            animate="visible"
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
          >
            ArchVision AI transforms natural language, code repositories and database schemas into
            beautiful class, sequence and ER diagrams — then lets you refine them with plain English
            prompts, validate the architecture and export production-grade artifacts.
          </motion.p>

          <motion.div
            variants={fadeUp}
            custom={0.24}
            initial="hidden"
            animate="visible"
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link href={authed ? "/dashboard" : "/register"}>
              <Button size="lg" className="w-full sm:w-auto">
                <Wand2 className="h-4 w-4" />
                {authed ? "Open your workspace" : "Start building"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#preview">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <Play className="h-4 w-4" />
                Watch it work
              </Button>
            </a>
          </motion.div>

          <motion.div
            variants={fadeUp}
            custom={0.32}
            initial="hidden"
            animate="visible"
            className="mt-10 flex items-center justify-center gap-6 text-[13px] text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-teal-600" /> Blazing-fast streaming
            </span>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <span className="flex items-center gap-1.5">
              <Workflow className="h-3.5 w-3.5 text-primary" /> 9 diagram types
            </span>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" /> 4 languages of codegen
            </span>
          </motion.div>
        </div>

        <motion.div
          id="preview"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1], delay: 0.4 }}
          className="relative mx-auto mt-20 max-w-5xl"
        >
          <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-primary/10 via-transparent to-accent/15 blur-2xl" />
          <PreviewCard />
        </motion.div>
      </div>
    </section>
  );
}