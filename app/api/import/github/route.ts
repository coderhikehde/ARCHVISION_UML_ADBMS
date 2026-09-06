import { withApiHandler } from "@/lib/http/with-api-handler";
import { BadRequestError } from "@/lib/http/api-error";
import { importGitHubRepo } from "@/lib/importers/github";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GitHubImportSchema = z.object({
  repoUrl: z.string().trim().min(1).max(500),
  branch: z.string().trim().max(100).optional(),
  token: z.string().trim().max(500).optional(),
});

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

export const POST = withApiHandler(
  async (ctx) => {
    const { repoUrl, branch, token } = await ctx.body<z.infer<typeof GitHubImportSchema>>();
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) throw new BadRequestError("Invalid GitHub URL — expected https://github.com/owner/repo");
    const { owner, repo } = parsed;
    const ref = branch?.trim() || "main";

    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "archvision-ai" };
    if (token) headers.Authorization = `Bearer ${token}`;
    // Also allow server-side token via env for private repos when user doesn't provide one
    else if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    // 1) Resolve branch to commit SHA (handles default branch fallback)
    let sha = ref;
    // Try as branch name first
    const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${ref}`, { headers });
    if (branchRes.ok) {
      const data = (await branchRes.json()) as { object?: { sha?: string } };
      if (data.object?.sha) sha = data.object.sha;
    } else if (branchRes.status === 404 && ref === "main") {
      // Fallback to master for older repos
      const masterRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/master`, { headers });
      if (masterRes.ok) {
        const data = (await masterRes.json()) as { object?: { sha?: string } };
        if (data.object?.sha) sha = data.object.sha;
      }
    }

    // 2) Fetch recursive tree
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, { headers });
    if (!treeRes.ok) {
      const body = await treeRes.text();
      throw new BadRequestError(`GitHub API error (${treeRes.status}): ${body.slice(0, 200)}`);
    }
    const treeData = (await treeRes.json()) as { tree: Array<{ path: string; type: string }>; truncated?: boolean };

    const sourcePaths = treeData.tree
      .filter((e) => e.type === "blob" && /\.(ts|tsx|js|jsx|mjs|cjs|py|java|kt|go|rb|php|cs|cpp|hpp|c|h)$/i.test(e.path))
      .slice(0, 100)
      .map((e) => e.path);

    if (sourcePaths.length === 0) throw new BadRequestError("No source files found in that repository.");

    // 3) Fetch contents (batched, limited)
    const files: Array<{ path: string; content: string }> = [];
    for (const path of sourcePaths) {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${sha}`, { headers });
      if (!res.ok) continue;
      const data = (await res.json()) as { content?: string; encoding?: string; size?: number };
      if (data.content && data.encoding === "base64") {
        // GitHub API caps at 1MB per file for contents endpoint — skip oversized
        if ((data.size ?? 0) > 500_000) continue;
        try {
          const text = Buffer.from(data.content, "base64").toString("utf-8");
          files.push({ path, content: text });
        } catch {
          // binary or undecodable — skip
        }
      }
      // Be nice to the API
      if (files.length % 20 === 0) await new Promise((r) => setTimeout(r, 200));
    }

    const result = importGitHubRepo(files);
    return ctx.json(result);
  },
  {
    auth: "optional",
    rateLimit: { key: "import:github", limit: 10, windowMs: 60_000 },
    bodySchema: GitHubImportSchema,
    name: "import.github",
  }
);
