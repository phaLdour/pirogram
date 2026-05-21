# GitHub Action — let AgentWatch drive Claude Code on your repo

This is the one-time setup you do on each repo you want to drive from AgentWatch's
"Drive on GitHub" sprint button.

## What gets installed

A `.github/workflows/claude.yml` workflow that runs Claude Code in a GitHub
Actions runner whenever AgentWatch opens (or comments on) an issue labeled
`agentwatch-driven`. Claude has `contents: write` + `issues: write` +
`pull-requests: write` permissions — it can read your repo, push commits, open
PRs, and post comments back. All of its activity flows back to AgentWatch via
the GitHub webhook you set up in Sprint 6.

## Install

1. Copy [`claude.yml`](./claude.yml) into your repo at
   `.github/workflows/claude.yml`.

2. Add your Anthropic API key as a repository secret:
   - GitHub → repo → **Settings → Secrets and variables → Actions**
   - **New repository secret**
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key (you pay for these tokens; AgentWatch
     never sees the key)

3. Commit + push. The workflow is now active. You can verify by going to the
   repo's **Actions** tab.

## Cost model — be explicit

- **GitHub Actions minutes:** runs on your free 2000 min/month allowance
  (public repos are free). Each Claude run is typically 2-10 minutes.
- **Anthropic API tokens:** billed to your Anthropic account against the key
  in the secret. Claude Opus 4.7 is ~$5/M input, $25/M output. Expect single-
  digit cents per simple sprint, $1-5 for a multi-iteration coding task.

AgentWatch itself charges nothing for this — it's just orchestration UI.

## What AgentWatch will do on the GitHub side

- **On "Drive on GitHub":** open an issue titled `[AgentWatch] <sprint name>`
  with body `@claude\n\n<sprint goal>` and label `agentwatch-driven`.
- **On "Reply":** post a comment to that issue, prefixed `@claude ` if not
  already.
- **On "Stop driving":** mark the sprint locally as completed. AgentWatch
  does **not** cancel an in-flight workflow run; if Claude is mid-task on the
  GitHub runner it will keep going. (Hard cancel via the GitHub API is a
  Sprint 10 follow-up.)

## What Claude will do

- Reads the issue body + comment thread as its prompt.
- Works in the repo, commits to a branch, opens a PR.
- Posts progress + questions as issue comments (replies to AgentWatch arrive
  via these).
- Closes the issue when it opens the PR (the PR description usually contains
  `Closes #<issue>` which AgentWatch's webhook handler uses to flip the
  sprint driver state to `COMPLETED` on merge).

## Limits to know

- Claude Code Action runs in a sandboxed runner — it can't access your local
  IDE, custom tools, or anything outside the repo + Anthropic API.
- The Action queue + cold start = ~30-90s before Claude's first comment.
  AgentWatch shows "Issue opened — waiting for Claude Code Action to pick up"
  during this window.
- "Question detection" is heuristic: AgentWatch flips the panel to
  "AWAITING_USER" if Claude's last comment ends with `?`. Imperative
  questions ("Please confirm the dependency version") may not be caught —
  you can still reply manually.
- One driver issue per sprint at a time. Retry by ending the sprint, starting
  a fresh one.
