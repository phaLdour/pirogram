# Claude Code hook adapter

Bridges Claude Code's native hook events to AgentWatch so the live dashboard reflects what your local Claude Code session is doing in real time.

## Install (per repo, e.g. `english4kids`)

```bash
mkdir -p .claude/hooks
cp <agentwatch-repo>/docs/integrations/claude-code-hooks/agentwatch-emit.sh \
   .claude/hooks/agentwatch-emit.sh
chmod +x .claude/hooks/agentwatch-emit.sh
```

## Configure

Generate a webhook key on `https://<your-agentwatch>.vercel.app/settings` and copy the plaintext secret. Export the three env vars in your shell profile or a per-project `.envrc`:

```bash
export AGENTWATCH_URL=https://pirogram-delta.vercel.app
export AGENTWATCH_SECRET=<plaintext secret from /settings>
export AGENTWATCH_AGENT_NAME=PM    # this hook will report as "PM"
# optional:
export AGENTWATCH_DEBUG=1          # mirror each payload + signature to stderr
```

## Wire up Claude Code hooks

In your repo's Claude Code settings (`.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart":      [{ "hooks": [{ "type": "command", "command": ".claude/hooks/agentwatch-emit.sh" }] }],
    "UserPromptSubmit":  [{ "hooks": [{ "type": "command", "command": ".claude/hooks/agentwatch-emit.sh" }] }],
    "PreToolUse":        [{ "hooks": [{ "type": "command", "command": ".claude/hooks/agentwatch-emit.sh" }] }],
    "PostToolUse":       [{ "hooks": [{ "type": "command", "command": ".claude/hooks/agentwatch-emit.sh" }] }],
    "Stop":              [{ "hooks": [{ "type": "command", "command": ".claude/hooks/agentwatch-emit.sh" }] }]
  }
}
```

## Mapping

| Claude Code hook | AgentWatch event |
| --- | --- |
| `SessionStart`, `SessionEnd`, `Stop`, `SubagentStop` | `TeammateIdle` (agent flips to IDLE) |
| `UserPromptSubmit` | `Message` (body = first 400 chars of prompt) |
| `PreToolUse` (`Task` tool) | `TaskCreated` with synthetic id `local/<session>-<uuid>` |
| `PreToolUse` (other tools) | `Message` "→ ToolName" |
| `PostToolUse` (any tool) | `Message` ("✓ completed Task tool" or "← ToolName") |

## Verify

In a Claude Code session that has the hooks wired, run any command (e.g. ask Claude to list files). Within 1–2 seconds:

- Your `AGENTWATCH_AGENT_NAME` should appear in the `AgentList` card.
- A new entry should land in the `LiveFeed` panel.

If nothing shows up, run the adapter once manually with debug on:

```bash
AGENTWATCH_DEBUG=1 HOOK_EVENT_NAME=SessionStart \
  ./.claude/hooks/agentwatch-emit.sh <<<'{}'
```

The signed POST should print to stderr and the dashboard should reflect a `TeammateIdle` event.

## Limitations (intentional)

- The adapter runs locally — only your machine reports activity, not your collaborators'.
- The script never blocks Claude Code: any error exits 0 silently.
- Per-repo tagging is **not** automatic here; events posted via `/api/webhook/events` are not associated with a bound `Repo` record. Per-repo tagging from local hooks lands in Sprint 7+.
