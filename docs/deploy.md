# Deploying AgentWatch to production (Vercel)

This is the first-time deploy runbook. After this, every push to `main` will redeploy automatically via the Vercel ↔ GitHub integration.

## 0. What you provision (out-of-band)

These three services need accounts you control. Each takes 2–5 minutes.

| Service | Why | Free-tier link |
| --- | --- | --- |
| **Neon** (Postgres) | Durable state | https://neon.tech |
| **Upstash** (Redis) | Live event stream | https://upstash.com |
| **GitHub OAuth App** | Sign-in | https://github.com/settings/developers → New OAuth App |

For the GitHub OAuth App, set:

- **Homepage URL:** `https://<your-vercel-project>.vercel.app`
- **Authorization callback URL:** `https://<your-vercel-project>.vercel.app/api/auth/callback/github`

(You can fill these in with a placeholder, deploy, then come back and update them with the real URL Vercel gives you.)

## 1. Connect the repo to Vercel

1. https://vercel.com/new
2. Import `phaLdour/pirogram`
3. **Framework preset:** Next.js (auto-detected from `vercel.json`)
4. **Root directory:** `./`
5. **Install command:** `pnpm install --frozen-lockfile` (auto)
6. **Build command:** `pnpm prisma:generate && pnpm prisma:migrate && pnpm build` (auto from `vercel.json`)

Do **not** click Deploy yet — set env first.

## 2. Required environment variables

Set these in **Project Settings → Environment Variables → Production**.

| Name | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://...neon.tech/...?sslmode=require` | Use Neon's **pooled** connection string. |
| `UPSTASH_REDIS_REST_URL` | `https://<region>.upstash.io` | Upstash console → "REST API". |
| `UPSTASH_REDIS_REST_TOKEN` | (token) | Same console page. |
| `NEXTAUTH_URL` | `https://<your-project>.vercel.app` | After first deploy, copy the assigned URL here and redeploy. |
| `NEXTAUTH_SECRET` | (see secrets I generated in chat) | `openssl rand -base64 32` if regenerating. |
| `GITHUB_ID` | OAuth App Client ID | From the GitHub OAuth App. |
| `GITHUB_SECRET` | OAuth App Client Secret | From the GitHub OAuth App. |
| `WEBHOOK_SIGNING_SECRET` | (see secrets) | Env-fallback signer. Production should prefer DB-issued keys from the Settings UI. |
| `WEBHOOK_KEY_ENCRYPTION_KEY` | (see secrets) | 64 hex chars. Master key for AES-GCM. **Never rotate without re-encrypting all keys.** |

## 3. First deploy

Click **Deploy**. The build runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm prisma:generate`
3. `pnpm prisma:migrate` — applies both migrations (`0001_init`, `0002_webhook_keys_encrypted`) against Neon
4. `pnpm build`

When it finishes, copy the Vercel-assigned URL (e.g. `https://pirogram-abc123.vercel.app`).

## 4. Loop back

1. Update **`NEXTAUTH_URL`** env to the real URL → redeploy.
2. Update the GitHub OAuth App's **Homepage URL** and **Authorization callback URL** with the same hostname.
3. Sign in at `https://<your-project>.vercel.app/signin` with GitHub. (The first sign-in writes your `User` row.)
4. Visit `/settings` and generate a DB-backed webhook key — copy the one-time plaintext secret.

## 5. Configure Claude Code hooks

Point your hooks at:

```
POST https://<your-project>.vercel.app/api/webhook/events

Headers:
  Content-Type: application/json
  X-AgentWatch-Signature: sha256=<hex(HMAC-SHA256(body, secret))>
  X-AgentWatch-Timestamp: <unix-seconds, must be within ±5 min>

Body (one of):
  {"type":"TaskCreated","eventId":"<uuid>","at":"<ISO8601>","task":{"id":"T-1","title":"…","assignee":"PM"}}
  {"type":"TaskCompleted","eventId":"<uuid>","at":"<ISO8601>","taskId":"T-1"}
  {"type":"TeammateIdle","eventId":"<uuid>","at":"<ISO8601>","agent":"PM"}
  {"type":"Message","eventId":"<uuid>","at":"<ISO8601>","from":"PM","to":"BE","taskId":"T-1","body":"…"}
  {"type":"SprintStarted","eventId":"<uuid>","at":"<ISO8601>","sprint":{"name":"v1.0"}}
  {"type":"SprintEnded","eventId":"<uuid>","at":"<ISO8601>","sprintId":"<id>"}
```

## 6. Verify

```bash
curl -i https://<your-project>.vercel.app/api/health
# → 200 {"status":"ok",...}

BODY='{"type":"TeammateIdle","eventId":"'"$(uuidgen)"'","at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","agent":"PM"}'
TS=$(date +%s)
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SIGNING_SECRET" | awk '{print $2}')
curl -i -X POST https://<your-project>.vercel.app/api/webhook/events \
  -H "Content-Type: application/json" \
  -H "X-AgentWatch-Signature: sha256=$SIG" \
  -H "X-AgentWatch-Timestamp: $TS" \
  --data "$BODY"
# → 202 {"accepted":true,...}
```

Open the dashboard — the `PM` agent card should appear within a second.

## Notes on the runtime

- The SSE endpoint (`/api/events/stream`) is configured with `maxDuration: 60`. The browser's `EventSource` automatically reconnects with `Last-Event-ID`, so the user-visible "live" experience is uninterrupted across function restarts.
- The webhook endpoint has `maxDuration: 15`. A transactional DB write + Redis XADD typically completes in <100 ms.
- Neon's pooled connection is preferred; Prisma works against it without extra config.
