# AgentWatch — Backlog

Source of truth for Sprint 1+ user stories. Sprint 0 is foundations only;
nothing here is implemented yet.

## Epic A — Live Agent Activity

- **A1** — As an observer, I see which agents are active and what they are doing.
  - Acceptance: agent card shows name, role, status (idle/working/blocked), current task, last activity time.
- **A2** — When an agent emits a message, I see it in the feed in under 1 second.
- **A3** — I can filter the message feed by agent / task / time range.

## Epic B — Tasks

- **B1** — I see all tasks in Kanban columns (Pending / In-Progress / Done).
- **B2** — Clicking a task shows description, assignee, timestamps, and related messages.
- **B3** — The board updates live as `TaskCreated` / `TaskCompleted` hooks arrive.

## Epic C — Sprints & Versioning

- **C1** — I can start a sprint (name, goal, start time).
- **C2** — The active sprint shows a progress bar (done/total tasks).
- **C3** — "End Sprint" produces: a semver bump (minor by default), a changelog from completed tasks, and an archived sprint record.
- **C4** — I can browse historical sprints with their changelogs.

## Epic D — Auth & Setup

- **D1** — I can log in with GitHub.
- **D2** — I can view and rotate my webhook URL + signing secret in Settings.

## Sprint 1 priority

D1, D2, A1, A2, B1, B3 — a live read-only dashboard MVP.
