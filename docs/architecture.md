# AgentWatch — Architecture

## Overview

```
Claude Code hooks ──► POST /api/webhook/events ──► Postgres (EventLog + domain tables)
                                              └──► Redis pub/sub ──► Socket.io ──► Browser
```

## Components

- **Next.js 15 (App Router)** — server + UI.
- **Postgres (Neon)** — durable state via Prisma.
- **Redis (Upstash)** — live channel and cross-instance pub/sub for Socket.io.
- **Socket.io** — browser live channel; Redis adapter for horizontal scale (Sprint 1).
- **NextAuth v5** — GitHub OAuth, JWT session.

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

## Realtime pipeline (Sprint 1 plan)

1. Webhook handler upserts `EventLog` by `eventId` (idempotent).
2. Handler applies domain projections (Agent / Task / Message / Sprint).
3. Handler publishes payload to Redis channel `events:live`.
4. Socket.io server (with Redis adapter) fans out to the `team:default` room.
5. Client `useLiveEvents()` hook merges into local store with optimistic UI.
6. On reconnect the client resyncs via `GET /api/events?since=<ts>`.

## Auth

- GitHub OAuth via NextAuth v5; JWT session in Sprint 0.
- Sprint 1 swaps to `PrismaAdapter` once the DB is provisioned.
- Socket.io handshake validates the NextAuth session cookie; anonymous connections are rejected.

## Multi-tenancy

Sprint 0/1 ship single-tenant (single team, single room `team:default`). Org/team scoping is a post-MVP migration: add `teamId` foreign keys + room `team:<id>`.
