# AgentWatch — UX Wireframe & Component Spec

## Primary screen: Dashboard

```
┌──────────────────────────────────────────────────────────────────────┐
│ AgentWatch  [Sprint: v1.2-dev ▾ 7/12 done ███████░░░░░]  [user ▾]   │  ← TopBar
├───────────────┬──────────────────────────────┬───────────────────────┤
│ AGENTS (left) │ TASKS (center, Kanban)       │ LIVE FEED (right)     │
│               │                              │                       │
│ ● PM       ⏵  │ PENDING │ IN-PROG │ DONE     │ 14:02 PM → BE         │
│ ● UX       ⏸  │  □ T-12 │  □ T-09 │  ✓ T-01  │   "schema ready?"     │
│ ● BE       ⏵  │  □ T-13 │  □ T-10 │  ✓ T-02  │ 14:03 BE → PM         │
│ ● DevOps   ⏸  │         │         │  ✓ T-03  │   "yes, pushed"       │
│ ● QA       ⏵  │         │         │          │ 14:04 [TaskDone T-03] │
│               │                              │                       │
│ + invite      │                              │ [filter: all ▾]       │
├───────────────┴──────────────────────────────┴───────────────────────┤
│ FOOTER: connection status (● live) · last event 2s ago               │
└──────────────────────────────────────────────────────────────────────┘
```

## Secondary screens

- `/sprints` — history list + per-sprint changelog detail.
- `/settings` — webhook URL/secret rotation, GitHub connection status.

## Component contracts

| Component | Props (summary) | Notes |
| --- | --- | --- |
| `TopBar` | `sprint: SprintSummary`, `user: SessionUser` | Server component; sprint progress bar. |
| `AgentList` | `agents: AgentLive[]` | Client; subscribes to live channel. |
| `AgentCard` | `agent: AgentLive` | Status dot (idle gray, working green, blocked red) + textual status. |
| `TaskBoard` | `tasksByStatus: Record<TaskStatus, Task[]>` | Client; optimistic on event. |
| `TaskCard` | `task: Task` | Click → `TaskDrawer`. |
| `LiveFeed` | `events: FeedEvent[]` | Virtualized list (>500 events). |
| `FeedFilters` | `value`, `onChange` | Filter by agent / task / type. |
| `ConnectionBadge` | `state: 'live' \| 'reconnecting' \| 'down'` | Footer. |

## A11y & visual baseline

- Tailwind `slate-*` neutrals on dark background.
- Status always doubled with an icon and text label — never color-only.
- All interactive elements have `aria-label`s; keyboard focus order matches visual order.
