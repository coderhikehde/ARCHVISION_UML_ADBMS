# ArchVision AI — Execution Manual

**Location:** `C:\Users\BHARADWAJA REDDY\archvision-ai`
**Repo:** https://github.com/12POISON/ARCHvision-AI-uml.git (`main` branch)

## 1. Prerequisites

- **Node.js** 20+ (tested on 24.14.0) — `node -v`
- **npm** 10+ — `npm -v`
- **PostgreSQL 15+** or a Neon cloud URL (already configured)
- **Git**

## 2. Installation

```powershell
git clone https://github.com/12POISON/ARCHvision-AI-uml.git
Set-Location "C:\Users\BHARADWAJA REDDY\archvision-ai"
npm install
```

## 3. Environment

Two files control configuration. Secrets live in `.env.local` (gitignored).

### `.env.local` — machine-local, never committed (already present)

```ini
DATABASE_URL="postgresql://user:password@ep-odd-surf-...pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-odd-surf-...c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
NEXT_PUBLIC_DATA_MODE="db"
OPENAI_API_KEY="sk-..."   # get at https://platform.openai.com/api-keys — rotate if leaked
```

### `.env` — shared defaults

```ini
DATABASE_URL="..."              # same as above or local postgres
NEXTAUTH_SECRET="..."           # required in prod: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
GITHUB_CLIENT_ID=""             # optional — https://github.com/settings/developers
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""             # optional — https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_SECRET=""
ANTHROPIC_API_KEY=""            # optional alternative to OpenAI
```

> See `.env.example` for the full documented list. `NEXT_PUBLIC_DATA_MODE=db` = PostgreSQL via REST API; unset = localStorage demo mode. `REDIS_URL`, `AWS_*`, `R2_*`, `SENTRY_DSN`, `ENCRYPTION_KEY` in older `.env` files are dead config — safe to delete (zero code refs).

Generate `NEXTAUTH_SECRET` in PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

OAuth callback URLs to register:

- GitHub: `https://YOUR-URL.vercel.app/api/auth/callback/github`
- Google: `https://YOUR-URL.vercel.app/api/auth/callback/google`

Demo login auto-disables in production once real OAuth keys exist.

## 4. Database

```powershell
npm run db:generate   # regenerate Prisma client (after schema changes)
npm run db:migrate    # prisma migrate dev — creates/updates tables
npm run db:deploy     # production: apply pending migrations
npm run db:seed       # optional demo user + "Auth Service" project
```

Migrations live in `prisma/migrations/` and are applied to the live Neon DB via `prisma.config.ts` (`DATABASE_URL`).

## 5. Run Locally

### Development (hot reload)

```powershell
npm run dev
# → http://localhost:3000
# First compile: ~120s (5,964 modules) — subsequent reloads <1s
# Health probe: http://localhost:3000/api/health → {"status":"ok","db":"up"}
```

### Production

```powershell
npm run build
npm run start        # serves optimized build on :3000
```

### Stop

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
# or Ctrl+C in the terminal running npm run dev
```

## 6. Verify

```powershell
npm run typecheck   # tsc --noEmit — must exit 0
npm run lint        # next lint --max-warnings=0 — must be clean
npm run test        # 125 tests via node --test + alias-loader — must be 125 pass
npm run build       # production build must succeed
```

Current at `main` (commit `9c43b68`): **125/125 pass, typecheck 0, lint 0, build green.**

## 7. Project Structure

```
app/api/**                 REST routes (projects, diagrams, ai/chat SSE, health, orgs)
lib/architecture/          AST, Mermaid parser/serializer, hierarchy (C4 namespaces),
                           cloud-icons, ADR (Nygard markdown)
lib/data/repositories/     Prisma-backed ports (project/diagram/version/validation/org)
lib/services/              Business rules (quota, concurrency, idempotency, RBAC)
lib/importers/             OpenAPI + SQL DDL → Architecture
lib/http/                  withApiHandler pipeline, rate limiting, SSE framing
components/editor/         Canvas (React Flow + dagre), toolbar, palette, properties,
                           ai-sidebar, adr-panel, version history
hooks/useDiagram.ts        Editor engine (autosave with 409 retry, C4 drill-down focus)
tests/                     alias-loader.mjs + *.test.ts (unit + live-DB integration)
prisma/                    schema.prisma + migrations
```

## 8. Key Features to Try

- **Create diagram:** Dashboard → *Create diagram* → tabs: *AI description* / *Manual info* / *Import OpenAPI* (.json/.yaml) / *Import SQL* (.sql) — OpenAPI creates two diagrams (architecture + flow), SQL creates an ER diagram with PK/FK/UK + cardinality.
- **Cloud icons:** Select a node → Properties → *Cloud service icon* (AWS/GCP/Azure/K8s/Docker/Kafka/Redis) — stored as `<<stereotype>>` in clean Mermaid.
- **C4 hierarchy:** Select a node → Properties → *Contained in* to nest; double-click a container on canvas to drill in; breadcrumb bar appears (`All levels / Auth Service / JWTController`).
- **ADR:** Toolbar *ScrollText* icon → Architecture decisions panel (Nygard markdown, node-linked, `.md` export); linked ADRs show as chips in the properties panel.
- **Palette:** Left shape/template panel — if closed, toolbar *PanelLeft* toggle or the floating left-edge button reopens it (Ctrl+B).

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `500` on create diagram | Corrupted `.next-dev` webpack cache | `Remove-Item -Recurse -Force .next-dev,.next; npm run dev` |
| `Not found or not yours` | Phantom project from offline cache | Refresh the page — dashboard re-syncs to DB; ghost disappears |
| `503` health briefly | Neon cold start (3s DB timeout) | Wait 5s and retry — self-heals |
| UI timeout on first load | 126s initial compile (5964 modules) | Wait, then reload — subsequent loads instant |
| `aiProvider: none` | No `OPENAI_API_KEY` | Add to `.env.local` and restart dev server |
| `npm run typecheck` slow | Dev server hogging CPU during compile | Wait for `Compiled / in ...` in `dev.log`, then retry |

## 10. Deployment (Vercel)

1. Import `12POISON/ARCHvision-AI-uml` in Vercel.
2. Add env vars in Vercel → Settings → Environment Variables: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_DATA_MODE=db`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (= your vercel URL), `NEXT_PUBLIC_APP_URL` (same), `OPENAI_API_KEY`, plus `GITHUB_*` / `GOOGLE_*` if using OAuth.
3. Deploy. Add the live URL to the README *Try it live* button.

---

*Generated for ArchVision AI — keep this file alongside `README.md`.*
