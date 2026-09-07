import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { EditorShell, type AiMode } from "@/components/editor/editor-shell";

export const metadata: Metadata = {
  title: "Diagram editor",
};

function resolveAiMode(): AiMode {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const isValid = (k?: string) => !!k && k !== "sk-dummy" && !k.startsWith("sk-dummy") && k !== "dummy";
  if (isValid(groqKey)) return "openai";
  if (isValid(openaiKey)) return "openai";
  if (isValid(anthropicKey)) return "anthropic";
  return "offline";
}

export default async function EditorPage({ params }: { params: { diagramId: string } }): Promise<React.ReactElement> {
  const session = await auth();
  const user = session?.user ?? { name: "Guest", email: "guest@archvision.local", image: null };
  return <EditorShell diagramId={params.diagramId} aiMode={resolveAiMode()} user={user} />;
}
