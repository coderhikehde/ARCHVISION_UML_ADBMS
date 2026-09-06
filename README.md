# ArchVision AI ⚡ Automatic UML Diagram Generator

Transform **natural language, code repositories and database schemas** into production-ready UML
diagrams — then refine them with plain-English prompts, validate the architecture, and export
clean artifacts.

> **Zero-config mode:** the app runs fully offline with no API keys or database. Demo auth,
> localStorage persistence and ArchVision's local extraction engine power every feature. Add
> keys/DBs and the same code paths switch to GPT-4o / Claude and PostgreSQL.

## 📊 Honest status

| Area | Status |
| --- | --- |
| Diagram engine (Mermaid ↔ canvas, editing, layout) | ✅ Working |
| AI copilot (streaming chat, transforms, offline engine) | ✅ Working (needs your own API key for online mode) |
| Validation, analysis, codegen, exports | ✅ Working |
| Auth | ⚠️ OAuth via GitHub/Google when configured; demo user otherwise — no email/password |
| Persistence | ⚠️ PostgreSQL in `db` mode; localStorage otherwise; **no public demo deployment yet** |
| Sharing / real-time collaboration | 🚧 Roadmap — share dialog is preview-only |
| Cloud icon library (AWS/GCP/Azure/K8s/Docker/Kafka/Redis) | ✅ Working — assign via node properties → "Cloud service icon" |
| OpenAPI / Swagger importer | ✅ Working — "Create diagram → Import OpenAPI" (JSON/YAML, generates architecture + flow diagrams locally) |
| SQL DDL importer | ✅ Working — "Create diagram → Import SQL" (Postgres/MySQL CREATE TABLE → ER diagram with PK/FK + cardinality) |
| Architecture Decision Records | ✅ Working — editor toolbar → ADR panel (Nygard markdown, node-linked, .md export; stored locally) |
| Multi-tenant workspaces & RBAC | ✅ API shipped — orgs + admin/editor/viewer/guest roles (`/api/orgs`); UI wiring lands with real-time sync |
| Real-time multiplayer (Yjs cursors/edits) | 🚧 Roadmap — needs a hosting decision (PartyKit vs self-hosted Yjs+ws) |
| C4 hierarchy | ✅ Core working — Mermaid `namespace` containers, double-click drill-down, breadcrumbs, "Contained in" reparenting |
| GitHub repo & database DDL ingestion | 🚧 Roadmap |
| C4 swimlane/group visuals, multi-level zoom animations | 🚧 Roadmap |

---

## 📸 Screenshots

> Visual proof lives in [`docs/screenshots/`](docs/screenshots/) — 8 shots cover the happy path (dashboard → generate → canvas with cloud icons → C4 drill-down → validation → ADR → export → import preview). Drop PNGs per that folder's README and they render here automatically.

---

## ✨ Features

| Area | Capability |
| --- | --- |
| **Diagram engine** | Bi-directional Mermaid ↔ ReactFlow canvas (drag, connect, minimap, dagre auto-layout, orthogonal edges) |
| **Code editor** | Monaco panel with Mermaid syntax highlighting & error squiggles, 300ms two-way sync |
| **View modes** | Executive (simplified) ⇄ Engineering (full detail) with per-diagram persistence |
| **AI copilot** | Streaming chat, node-targeted edits ("Make User inherit from Account"), architecture critic, design-doc generation, AI description |
| **Scope wizard** | Paste requirements → entity extraction preview → toggle scope → generate |
| **Validation** | 7-rule 100-point checklist: inheritance cycles, god classes, detached nodes, naming… |
| **Analysis** | Coupling (afferent/efferent), cycles (graph DFS), missing abstraction insights + refactorings |
| **Onboarding** | First-run "three ways to start" flow + one-click starter template gallery |
| **Workspace** | Dashboard stats (real counts + storage mode), projects, first diagram in one click |
| **Collaboration UX** | Comments, version history (snapshots + restore), share dialog — sharing itself is roadmap-only and clearly labelled |
| **Codegen** | TypeScript / Java / Python / C# with Lombok, Pydantic, decorators, getters/setters |
| **Export** | SVG, PNG (2x/4x), PDF, PlantUML, Mermaid, JSON — validation-gated |
| **Comfort** | Command palette (Ctrl/Cmd K), keyboard shortcuts, mobile editor gate |

> **Auth & sharing status:** email/password sign-up is not implemented. Accounts come from
> GitHub/Google OAuth (buttons appear once credentials are set) or the demo user. The demo
> provider is **automatically disabled in production** when real OAuth is configured. Share
> links are a preview UX — they grant no access; collaboration is a roadmap item.

## 🚀 Quick start

```bash
npm install
npm run dev
# open http://localhost:3000 — sign in with "Demo access"
```

## 🔑 Configuration

Copy `.env.example` → `.env`. The app **always works**; env vars upgrade the stack:

```env
# AI (either provider is enough; both → primary + fallback)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# OAuth (buttons appear automatically once set)
GITHUB_CLIENT_ID=...    GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...    GOOGLE_CLIENT_SECRET=...

# Required in production — the app refuses to start without it (dev auto-generates)
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# PostgreSQL persistence (see below) — set at BUILD time
NEXT_PUBLIC_DATA_MODE=db
DATABASE_URL=postgresql://...
```

## 🐳 Docker

```bash
docker compose up --build
# app on :3000, PostgreSQL 15 bundled
```

## 📜 Scripts

```bash
npm run dev           # local dev (writes to .next-dev, separate from builds)
npm run build         # production build (standalone output)
npm run start         # serve production build
npm run lint          # ESLint (next/core-web-vitals + react, zero warnings)
npm run typecheck     # tsc --noEmit (strict, zero `any`)
npm run test          # 66 unit tests (node --test, TS alias loader)
npm run db:generate   # prisma generate
npm run db:migrate    # prisma migrate dev
npm run db:deploy     # prisma migrate deploy (production)
npm run db:seed       # optional demo user + Auth Service project
npm run db:studio     # prisma studio
```

## 🗄️ Storage — two modes, one source of truth

The app ships with a **two-mode storage layer** (`lib/data/storage.ts`):

| Mode | When | Persistence |
| --- | --- | --- |
| `local` (default) | `NEXT_PUBLIC_DATA_MODE` unset | localStorage (zero-infra demo) |
| `db` | `NEXT_PUBLIC_DATA_MODE=db` | PostgreSQL via Prisma → REST API (`/api/projects`, `/api/diagrams/...`) |

Every read and write goes through the same async facade, so no feature code changes when you
switch. The facade owns the **DB health check** and a **bounded timeout** on every call: if the
database is slow or unreachable, reads transparently fall back to local data instead of hanging
the UI.

Since the recent refactor, **reads are client-driven through a single shared store**
(`lib/data/workspace-store.ts`, Zustand): the dashboard, the projects page and the "Create
diagram" dropdown all consume the same `projects`/`diagrams` state — no second, independent
fetch anywhere. Creating a project instantly refreshes the dropdown (no page reload), in both
modes.

The repositories (`lib/data/repositories/*`) are the server-side source of truth: projects,
diagrams, version history, change log, prompt history and validation reports. The demo seed is
memoized per process and parallelized/batched, so first requests stay fast even on slow
connections.

```bash
# 1. Point PostgreSQL 15 at a host you control (or `docker compose up -d db`)
# 2. Set DATABASE_URL and NEXT_PUBLIC_DATA_MODE=db in .env, then BUILD:
npm run db:migrate        # applies migrations
npm run db:seed           # optional demo user + Auth Service project
npm run build && npm run start
```

> `NEXT_PUBLIC_*` values are inlined at **build time**, so set
> `NEXT_PUBLIC_DATA_MODE=db` before `npm run build`. In dev (`npm run dev`) it's
> read live from `.env`.

Production deploys run `npm run db:deploy` instead of `db:migrate`. Migrations live in
`prisma/migrations/`.

## 🔒 Security

- **Multi-tenancy at the query level:** the repositories scope every query to the
  authenticated user, and the REST routes (`/api/projects`, `/api/diagrams/...`) inject the
  user id from the session — payloads can never spoof ownership (no IDOR).
- **Rate limiting:** per-caller limiter on every route (`lib/rate-limit.ts`) — in-memory by
  default, Upstash/Redis via `RATE_LIMITER=upstash` for multi-instance deployments.
- **CSPRNG ids:** all generated ids use `crypto.randomUUID` — no sequential/guessable ids.
- **No hardcoded secrets:** `NEXTAUTH_SECRET` is required in production; dev auto-generates one.
- **Transport headers:** CSP, HSTS, X-Frame-Options DENY, nosniff, strict referrer/permissions
  policies (`next.config.mjs`), plus a middleware-enforced `charset=utf-8` on every HTML
  document.
- **Storage timeouts:** all DB calls are bounded (AbortController) so a dead database can never
  hang a user-facing action.

## 🔬 Where the intelligence lives

| Path | Purpose |
| --- | --- |
| `lib/data/workspace-store.ts` | Shared client store — single source of truth for workspace reads |
| `lib/data/storage.ts` | Mode-aware storage facade (health check, timeouts, local fallback) |
| `lib/data/repositories/` | Prisma repositories — PostgreSQL persistence + ownership scoping |
| `lib/mermaid/parser.ts` | `classDiagram` → typed `UMLModel` AST |
| `lib/mermaid/transformer.ts` | AST ↔ ReactFlow nodes/edges (dagre layout) |
| `lib/mermaid/validator.ts` | 7-rule validation + 100-point scoring |
| `lib/analysis/critic.ts` | coupling, cycles, god classes, insights |
| `lib/ai/mock-engine.ts` | offline extraction (entities/methods/attributes/relations) |
| `lib/ai/transforms.ts` | prompt → model transformation pipeline |
| `app/api/ai/chat/route.ts` | SSE streaming route (AI provider or offline engine) |

## ♿ Accessibility & performance

WCAG 2.1 AA: full keyboard nav, focus rings, ARIA labels, reduced-motion support. Performance:
lazy-loaded Monaco/Mermaid/ReactFlow, debounced sync (300ms), skeleton loading states on the
dashboard and projects pages, and charset-safe UI text that cannot regress into mojibake.

## 📄 Site content

Privacy policy, terms and contact pages live under `app/privacy`, `app/terms` and
`app/contact`. SEO is handled with `app/robots.ts`, `app/sitemap.ts`, `app/manifest.json` and
Open Graph images; `app/not-found.tsx`, `app/error.tsx` and per-route `loading.tsx` files cover
the error/slow-network experience.

---

Built with Next.js 14, TypeScript (strict), Tailwind, Framer Motion, ReactFlow, Mermaid, Monaco,
Zustand, React Query, Prisma 7 (pg driver adapter) and the Vercel AI SDK.