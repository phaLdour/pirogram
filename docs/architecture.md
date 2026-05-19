# AgentWatch — Architecture

## Overview

```
Claude Code hooks ──► POST /api/webhook/events ──► Postgres (EventLog + domain tables)
                                              └──► Redis pub/sub ──► Socket.io ──► Browser
```

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

Sprint-0 endpoint validates + ACKs. Persisting to Postgres and publishing to Redis lands in Sprint 1.

## Realtime pipeline (SSE + Redis Streams)

1. Webhook handler upserts `EventLog` by `eventId` (idempotent).
2. Handler applies domain projections (Agent / Task / Message / Sprint).
3. Handler `XADD events:live MAXLEN ~ 1000 *` to the Upstash Redis Stream.
4. Browser opens `GET /api/events/stream` (SSE, `text/event-stream`). The endpoint long-polls the stream with `XRANGE` from a `lastId` cursor (~500 ms cadence) and emits each entry as an SSE `data:` line.
5. Client `useLiveEvents()` hook (`EventSource`) merges into local React state.
6. On reconnect `EventSource` auto-resumes; the client passes the last seen stream id via the `Last-Event-ID` header so no events are lost.

Auth on the SSE endpoint reuses the NextAuth session cookie; unauthenticated requests get 401 and the browser will not reconnect.

## Auth

- GitHub OAuth via NextAuth v5 + `@auth/prisma-adapter`; database-backed sessions.
- `middleware.ts` redirects unauthenticated requests on `/` and `/settings` to `/api/auth/signin`.
- Webhook endpoint does **not** use session auth — it relies on HMAC signing only.

## Multi-tenancy

Sprint 0/1 ship single-tenant (single team, single room `team:default`). Org/team scoping is a post-MVP migration: add `teamId` foreign keys + room `team:<id>`.
