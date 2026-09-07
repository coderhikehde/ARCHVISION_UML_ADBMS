import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EditorShell, type AiMode } from "@/components/editor/editor-shell";

export const metadata: Metadata = {
  title: "Diagram editor",
};

function resolveAiMode(): AiMode {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const isValid = (k?: string) => !!k && k !== "sk-dummy" && !k.startsWith("sk-dummy") && k !== "dummy";
  if (isValid(openaiKey)) return "openai";
  if (isValid(anthropicKey)) return "anthropic";
  return "offline";
}

export default async function EditorPage({ params }: { params: { diagramId: string } }): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return <EditorShell diagramId={params.diagramId} aiMode={resolveAiMode()} user={session.user} />;
}
