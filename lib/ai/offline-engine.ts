import { parseArchitectureDiagram } from "@/lib/architecture/parse";
import { validateArchitecture } from "@/lib/architecture/validate";
import { generateDocumentation, generateSummary } from "@/lib/architecture/docs";
import { generateSequenceMermaid } from "@/lib/architecture/sequence";
import { detectArchitectureFromText } from "@/lib/architecture/detect";
import { architectureToMermaid } from "@/lib/architecture/serialization";
import { applyChange, type ArchitectureChange } from "@/lib/architecture/transforms";
import type { Architecture } from "@/types/diagram";
import type { AiChatRequest } from "@/lib/validation/schemas/ai.schemas";

/**
 * Deterministic offline chat engine — used when no AI provider key is
 * configured or the provider call fails. Pure functions, no I/O, fully
 * unit-testable. The wire format (SSE events) is the caller's concern.
 */

export interface ChatSink {
  write(event: string, data: string): void;
}

function simulate(chunks: string[], sink: ChatSink, delayMs = 26): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;
    const tick = (): void => {
      if (index >= chunks.length) {
        resolve();
        return;
      }
      const chunk = chunks[index];
      index += 1;
      sink.write("delta", chunk);
      const pause = chunk.endsWith("}\n") || chunk.endsWith("```\n") ? 240 : delayMs + (index % 5) * 9;
      setTimeout(tick, pause);
    };
    tick();
  });
}

function generateMock(prompt: string): string {
  const arch = detectArchitectureFromText(prompt);
  return architectureToMermaid(arch);
}

function explainMock(mermaid: string): string {
  const { architecture, error } = parseArchitectureDiagram(mermaid);
  if (error) {
    return `# Design Document\n\nUnable to parse the current diagram: ${error}. Verify the Mermaid syntax first.`;
  }
  return generateDocumentation(architecture);
}

function analyzeMock(mermaid: string): string {
  const { architecture, error } = parseArchitectureDiagram(mermaid);
  if (error) return `Could not parse the diagram for analysis: ${error}`;
  const validation = validateArchitecture(architecture);
  const lines: string[] = [`### Architecture Analysis (score ${validation.score}/100)`, ""];
  const criticals = validation.issues.filter((i) => i.severity === "critical");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const infos = validation.issues.filter((i) => i.severity === "info");
  if (criticals.length > 0) {
    lines.push("**🔴 Critical issues**", ...criticals.map((i) => `- ${i.message}`), "");
  }
  if (warnings.length > 0) {
    lines.push("**🟠 Warnings**", ...warnings.map((i) => `- ${i.message}`), "");
  }
  if (infos.length > 0) {
    lines.push("**🔵 Info**", ...infos.map((i) => `- ${i.message}`), "");
  }
  if (validation.issues.length === 0) {
    lines.push("No issues found — the model is consistent.");
  }
  lines.push("", `**Score: ${validation.score}/100** — ${validation.passed.length} checks passed of ${validation.checks.length}.`);
  return lines.join("\n");
}

function hasNode(arch: { nodes: Array<{ name: string }> }, name: string): boolean {
  return arch.nodes.some((n) => n.name === name);
}

function findName(arch: { nodes: Array<{ name: string }> }, needle: string): string | null {
  const lower = needle.toLowerCase();
  return (
    arch.nodes.find((n) => n.name.toLowerCase() === lower)?.name ??
    arch.nodes.find((n) => n.name.toLowerCase().includes(lower) || lower.includes(n.name.toLowerCase()))?.name ??
    null
  );
}

function applySingleChange(change: ArchitectureChange, arch: Architecture): Architecture | null {
  if (arch.nodes.length === 0 && change.kind === "addRelationship") return null;
  return applyChange(arch, change);
}

function transformMock(message: string, mermaid: string, selectedNode: string | null): string | null {
  const lower = message.toLowerCase();

  // convert to sequence
  if (/(?:convert|turn|transform|make).*sequence/i.test(lower)) {
    const { architecture, error } = parseArchitectureDiagram(mermaid);
    if (error) return null;
    return generateSequenceMermaid(architecture);
  }

  const { architecture } = parseArchitectureDiagram(mermaid);

  // rename
  const renameMatch = /rename\s+([A-Za-z_][A-Za-z0-9]*)\s+to\s+([A-Za-z_][A-Za-z0-9]*)/i.exec(message);
  if (renameMatch) {
    const from = findName(architecture, renameMatch[1]);
    if (from) {
      const changed = applySingleChange({ kind: "renameNode", from, to: renameMatch[2] }, architecture);
      if (changed) return architectureToMermaid(changed);
    }
  }

  // add class
  const addMatch = /(?:add|create|introduce)\s+(?:a\s+)?(?:new\s+)?(?:class\s+|entity\s+)?([A-Za-z_][A-Za-z0-9]*)/i.exec(message);
  if (addMatch && !hasNode(architecture, addMatch[1])) {
    const changed = applySingleChange({
      kind: "addNode",
      name: addMatch[1],
      connectTo: selectedNode && hasNode(architecture, selectedNode) ? selectedNode : null,
    }, architecture);
    if (changed) return architectureToMermaid(changed);
  }

  // make X inherit from Y
  const inheritMatch = /(?:make|let|change)\s+([A-Za-z_][A-Za-z0-9]*)\s+(?:inherit|extend)\s+(?:from\s+)?([A-Za-z_][A-Za-z0-9]*)/i.exec(message);
  if (inheritMatch) {
    const child = findName(architecture, inheritMatch[1]) ?? inheritMatch[1];
    const parent = findName(architecture, inheritMatch[2]) ?? inheritMatch[2];
    if (hasNode(architecture, child) && hasNode(architecture, parent)) {
      const changed = applySingleChange({ kind: "addRelationship", source: child, target: parent, type: "inheritance" }, architecture);
      if (changed) return architectureToMermaid(changed);
    }
  }

  // add method
  const methodMatch = /(?:add|give)\s+([A-Za-z_][A-Za-z0-9]*)\s+(?:a\s+)?(?:method|operation)\s+([a-z][A-Za-z0-9]*)/i.exec(message);
  if (methodMatch) {
    const target = findName(architecture, methodMatch[1]);
    if (target) {
      const changed = applySingleChange({ kind: "addMethod", node: target, method: methodMatch[2], returnType: "void" }, architecture);
      if (changed) return architectureToMermaid(changed);
    }
  }

  return null;
}

function whyMock(mermaid: string, selectedNode: string | null): string {
  const { architecture, error } = parseArchitectureDiagram(mermaid);
  if (error) return `I couldn't parse the diagram: ${error}`;
  const lines: string[] = [];
  const target = selectedNode;
  if (target) {
    const node = architecture.nodes.find((n) => n.id === target || n.name === target);
    if (node) {
      lines.push(`**${node.name} (${node.kind})** plays the role of *${roleDescription(node.kind)}*.`);
      const incoming = architecture.relationships.filter((r) => r.target === node.name);
      const outgoing = architecture.relationships.filter((r) => r.source === node.name);
      if (incoming.length > 0) {
        lines.push("- **Depended on by:** " + incoming.map((r) => `${r.source} (${r.type})`).join(", "));
      }
      if (outgoing.length > 0) {
        lines.push("- **Depends on:** " + outgoing.map((r) => `${r.target} (${r.type})`).join(", "));
      }
      if (node.attributes.length > 0) lines.push(`- **Attributes:** ${node.attributes.map((a) => a.name).join(", ")}`);
      if (node.methods.length > 0) lines.push(`- **Methods:** ${node.methods.map((m) => m.name).join(", ")}`);
    } else {
      lines.push(`Hmm — I couldn't find a node named "${target}".`);
    }
  } else {
    const summary = generateSummary(architecture);
    lines.push(`${summary}`);
    const criticals = validateArchitecture(architecture).issues.filter((i) => i.severity === "critical");
    if (criticals.length > 0) {
      lines.push("-", "**Most urgent issue:** " + criticals[0].message);
    } else {
      lines.push("No critical issues — the model is consistent. Select a node to ask about it specifically.");
    }
  }
  return lines.join("\n");
}

function roleDescription(kind: string): string {
  switch (kind) {
    case "controller":
      return "an HTTP boundary that routes requests into services";
    case "service":
      return "the business-logic layer orchestrating domain rules";
    case "repository":
      return "a data-access abstraction isolating persistence from services";
    case "database":
      return "a persistence store";
    case "table":
      return "a relational table (ER) entity";
    case "entity":
      return "a domain entity";
    case "interface":
      return "a contract consumed by other nodes";
    case "actor":
      return "an external participant in the interaction";
    default:
      return "a structural unit of the model";
  }
}

/** Stream an offline chat response (with the offline marker event). */
export async function offlineChat(input: AiChatRequest, sink: ChatSink): Promise<void> {
  sink.write(
    "meta",
    JSON.stringify({ fallback: true, message: "Offline mode — local extraction engine active" })
  );
  let content: string;
  const mermaid = input.mermaid ?? "";

  switch (input.action) {
    case "generate": {
      content = generateMock(input.message);
      break;
    }
    case "transform": {
      const transformed = transformMock(input.message, mermaid, input.selectedNode ?? null);
      if (!transformed) {
        sink.write("error", 'Could not interpret that change in offline mode. Try: "Make User inherit from Account", "Add class Payment", "Rename Order to Purchase", "Add method retry to Payment", "Convert to sequence diagram".');
        return;
      }
      content = transformed;
      break;
    }
    case "explain": {
      content = explainMock(mermaid);
      break;
    }
    case "analyze": {
      content = analyzeMock(mermaid);
      break;
    }
    case "why": {
      content = whyMock(mermaid, input.selectedNode ?? null);
      break;
    }
    case "chat":
    default: {
      if (!mermaid) {
        content = "I'm here to help you design. Try one of the suggested actions below, or paste a requirements description to generate a diagram.";
      } else {
        const { architecture, error } = parseArchitectureDiagram(mermaid);
        if (error) {
          content = `I hit a parsing error in the current diagram: ${error}. Fix the Mermaid syntax and try again.`;
        } else {
          content = `I can see **${architecture.nodes.length} nodes** and **${architecture.relationships.length} relationships** in *${architecture.title || "your diagram"}*. What would you like to change? Try one of the quick actions below.`;
        }
      }
    }
  }

  const chunks = content.match(/[\s\S]{1,36}/g) ?? [content];
  await simulate(chunks, sink);
}