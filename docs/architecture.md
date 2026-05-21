# AgentWatch — Architecture

## Overview

```
GitHub ──► POST /api/webhook/github  ─┐  (HMAC + repo lookup, X-GitHub-Delivery idempotency)
                                      │
                                      ├──►  EventLog + Agent/Task/Message/Sprint (Prisma)
Claude Code hooks                     │              │
   ↓ (adapter)                        │              ▼
POST /api/webhook/events ─────────────┘    Upstash Redis stream `events:live`
   (HMAC + replay window)                              │
                                                       ▼
                                              SSE  /api/events/stream  ─► Browser dashboard
```

Two write paths, one read path. Both webhook routes flow through the same `applyProjection` + `publishLiveEvent` pipeline.

## Components

- **Next.js 15 (App Router)** — server + UI.
- **Postgres (Neon)** — durable state via Prisma.
- **Redis (Upstash)** — live event stream (`events:live` Redis Stream) and cross-instance fan-out.
- **Server-Sent Events (SSE)** — one-way server→browser channel for live deltas. **Replaces the Socket.io plan from Sprint 0** because Vercel serverless functions cannot host long-lived WebSocket connections cleanly; SSE works natively with Vercel streaming responses.
- **NextAuth v5** — GitHub OAuth, Prisma adapter, JWT session.

## Webhook contract — `POST /api/webhook/events`

Headers:

- `X-AgentWatch-Signature: sha256=<hex>` — HMAC-SHA256(body, secret), constant-time compare.
- `X-AgentWatch-Timestamp: <unix-seconds>` — must be within ±5 minutes.

Body: one of the events in `lib/webhook/schema.ts` (`TaskCreated`, `TaskCompleted`, `TeammateIdle`, `Message`, `SprintStarted`, `SprintEnded`). Every event carries a `eventId` (UUID) for idempotency.

Responses:

- `202` accepted
- `400` invalid JSON
- `401` missing / stale / bad signature
- `422` schema-invalid payload
- `500` server misconfigured (missing secret)

## GitHub webhook contract — `POST /api/webhook/github`

Bind a repo on `/repos`; AgentWatch generates a per-repo HMAC secret and shows it once. Configure the GitHub webhook with:

- **Payload URL:** `https://<host>/api/webhook/github`
- **Content type:** `application/json`
- **Secret:** the plaintext from `/repos`
- **Events:** `push`, `pull_request`, `issues`, `workflow_run`

Headers GitHub sends:

- `X-GitHub-Event` — event name
- `X-Hub-Signature-256: sha256=<hex>` — HMAC-SHA256(body, repo.secret); no timestamp (idempotency comes from `X-GitHub-Delivery`)
- `X-GitHub-Delivery` — UUID; used as the seed for deterministic per-event `eventId`s so re-deliveries are dropped at `EventLog.eventId @unique`

Translator (`lib/webhook/github-translator.ts`):

| GitHub event | AgentEvent(s) |
| --- | --- |
| `push` (per commit) | `Message`; `TaskCreated` if commit subject is a Conventional Commit (`feat:`, `fix:`, …) |
| `pull_request.opened/reopened` | `TaskCreated` id=`<repo>/PR-<n>` |
| `pull_request.closed` | `TaskCompleted` |
| `issues.opened/reopened` | `TaskCreated` id=`<repo>/ISSUE-<n>` |
| `issues.closed` | `TaskCompleted` |
| `workflow_run.completed` && conclusion=failure | `Message` "CI failed: <name>" |
| `ping` | no-op (recognized) |
| anything else | no-op (`recognized: false`) |

Each emitted `AgentEvent` is validated against `agentEventSchema` before persistence — a translator bug cannot poison the projection pipeline.

## Realtime pipeline (SSE + Redis Streams)

1. Webhook handler upserts `EventLog` by `eventId` (idempotent).
2. Handler applies domain projections (Agent / Task / Message / Sprint).
3. Handler `XADD events:live MAXLEN ~ 1000 *` to the Upstash Redis Stream.
4. Browser opens `GET /api/events/stream` (SSE, `text/event-stream`). The endpoint long-polls the stream with `XRANGE` from a `lastId` cursor (~500 ms cadence) and emits each entry as an SSE `data:` line.
5. Client `useLiveEvents()` hook (`EventSource`) merges into local React state.
6. On reconnect `EventSource` auto-resumes; the client passes the last seen stream id via the `Last-Event-ID` header so no events are lost.

Auth on the SSE endpoint reuses the NextAuth session cookie; unauthenticated requests get 401 and the browser will not reconnect.

## Auth

- GitHub OAuth via NextAuth v5 + `@auth/prisma-adapter`; JWT session strategy so the Edge middleware stays light.
- Scope requested: `read:user user:email repo admin:repo_hook` — broad because the OAuth App is owned by the same identity signing in, and the broader scopes power one-click bind on `/repos` (list user's repos + install/remove the webhook server-side via the user's access token, stored in `Account.access_token`).
- `middleware.ts` redirects unauthenticated requests on `/`, `/settings`, `/sprints`, `/repos` to `/signin`.
- Webhook endpoints do **not** use session auth — they rely on HMAC signing only.

### One-click repo binding (`/repos`)

1. `/repos` server component reads `Account.access_token` + `scope` via `lib/github-token.ts`.
2. If scope is missing, render `<ReauthorizeCard />` (client) → `signIn("github", { callbackUrl: "/repos" })` triggers a fresh OAuth consent and updates the Account row on callback.
3. With scope present, `lib/github.ts:listMyRepos(token)` fetches the first 100 repos.
4. `<RepoPicker />` (client) renders a toggle per repo. Bind:
   - Calls `bindRepo` server action → generates secret → `installRepoWebhook` → upserts `Repo { encryptedSecret, githubHookId, installedBy }` → returns plaintext secret once.
5. Unbind:
   - Calls `unbindRepo` server action → best-effort `deleteRepoWebhook` → marks `Repo.revokedAt`.
6. A collapsible "Add a repo manually" fallback (`bindManually`) covers tokens that can't see a repo (e.g. org repos with limited scope).

## Multi-tenancy

Sprint 0/1 ship single-tenant (single team, single room `team:default`). Org/team scoping is a post-MVP migration: add `teamId` foreign keys + room `team:<id>`.
