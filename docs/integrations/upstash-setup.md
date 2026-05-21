# Upstash Redis — 6-step free setup

AgentWatch's dashboard updates live via Server-Sent Events backed by an
Upstash Redis stream. Without Upstash, the client falls back to polling the
DB every 3 seconds — works, but slower and chattier. Upstash's free tier
(10,000 commands/day, no credit card) is plenty for a single-user dashboard.

## Steps

1. Sign up at <https://upstash.com> (GitHub OAuth — no card required).
2. **Create database** → "Redis" → region close to your Vercel region (for
   AgentWatch production: `iad1`/`us-east-1`).
3. On the database page, scroll to **REST API**. Copy two values:
   - `UPSTASH_REDIS_REST_URL` (looks like `https://us1-foo-12345.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (long base64 string)
4. In Vercel: project → **Settings → Environment Variables** → add both
   names for the **Production** scope, paste the values, click **Save**.
5. Redeploy (Deployments → latest → ⋯ → **Redeploy**). The next deploy will
   pick up the new env vars; no code change.
6. Open the dashboard. The badge in the footer should read **live** within a
   second of the page loading. New events land in ~500 ms.

## How to tell it worked

- Connection badge: `live` (was `polling` or `reconnecting`).
- Hit the webhook with any sample event — the page should re-render within a
  second without a manual refresh.

## Quota

- Free tier: 10k commands/day. Each AgentWatch event uses 1 `XADD`; a
  typical sprint emits a few hundred events end-to-end.
- If you blow through the quota, the dashboard automatically falls back to
  client-side polling (3 s interval) — same UX, slightly higher latency, no
  errors.

## Tearing it down

Delete the env vars in Vercel and redeploy. AgentWatch goes back to the
polling fallback. No data loss; the stream just buffers events for 1000
entries max and gets re-created on the next event.
