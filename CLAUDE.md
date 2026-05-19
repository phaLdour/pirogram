# AgentWatch — Agent Operating Notes

## Quality gates (non-negotiable)

- TypeScript strict; `@typescript-eslint/no-explicit-any: error`.
- Every new feature ships with at least one Vitest unit test.
- Any PR touching `lib/auth.ts`, `lib/webhook/**`, or `app/api/auth/**` requires a security review note in the PR description.
- Use Conventional Commits (`feat:`, `fix:`, `chore:`...). The Sprint-end automation will read these to build the changelog.

## Day-to-day commands

```bash
pnpm install
pnpm prisma:generate
pnpm dev
pnpm lint && pnpm typecheck
pnpm test:unit
pnpm test:e2e            # builds and boots the app
```

## Layout

- `app/` — App Router routes (server-first; mark client components explicitly).
- `lib/` — shared server libs (`db`, `redis`, `webhook/*`, `auth`).
- `components/` — UI primitives (empty until Sprint 1).
- `prisma/schema.prisma` — single source of truth for the data model.
- `tests/unit/` Vitest, `tests/e2e/` Playwright.
- `docs/` — backlog, UX, architecture.

## What Sprint 0 deliberately does NOT do

- No DB writes from the webhook (the handler validates + ACKs only).
- No Socket.io implementation (contract is documented in `docs/architecture.md`).
- No real UI beyond a placeholder `/` page.
- No sprint/versioning automation.
