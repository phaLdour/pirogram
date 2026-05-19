# AgentWatch

Live monitoring dashboard for Claude Code agent teams.

> **Status:** Sprint 0 — foundations only. No live dashboard yet; the scaffold ships
> a placeholder home page, a signed-webhook receiver, a health endpoint, and the
> NextAuth GitHub iskelet.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind · Prisma (Neon Postgres) ·
Upstash Redis · NextAuth v5 · Vitest + Playwright · Vercel.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env.local        # fill in secrets
pnpm prisma:generate              # generates the Prisma client

# One-time DB setup (any Postgres 14+; Neon recommended for prod)
pnpm prisma:migrate:dev           # runs migrations + applies schema

pnpm dev                          # http://localhost:3000
```

### Required env vars

See `.env.example`. Minimum to boot locally:

- `WEBHOOK_SIGNING_SECRET` — `openssl rand -hex 32`
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`

`DATABASE_URL` is only consumed once `prisma migrate` is wired up in Sprint 1.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint (flat config) |
| `pnpm typecheck` | `tsc --noEmit`, strict |
| `pnpm test:unit` | Vitest |
| `pnpm test:e2e` | Playwright (builds + starts the app) |

## Webhook smoke test

```bash
BODY='{"type":"TaskCreated","eventId":"00000000-0000-4000-8000-000000000000","at":"2026-05-19T12:00:00Z","task":{"id":"T-1","title":"hi"}}'
TS=$(date +%s)
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SIGNING_SECRET" | awk '{print $2}')
curl -i -X POST http://localhost:3000/api/webhook/events \
  -H "Content-Type: application/json" \
  -H "X-AgentWatch-Signature: sha256=$SIG" \
  -H "X-AgentWatch-Timestamp: $TS" \
  --data "$BODY"
# 202 with correct signature, 401 otherwise.
```

## Docs

- [`docs/backlog.md`](docs/backlog.md) — user stories
- [`docs/ux/wireframe.md`](docs/ux/wireframe.md) — wireframe + component spec
- [`docs/architecture.md`](docs/architecture.md) — webhook + realtime design
- [`CLAUDE.md`](CLAUDE.md) — quality gates and commands for agents
