#!/usr/bin/env bash
# AgentWatch — Claude Code hook adapter.
#
# Reads a Claude Code hook payload from stdin, translates it to an AgentWatch
# event, HMAC-signs it with your webhook secret, and POSTs it. Failures are
# logged to stderr and never block Claude Code (always exits 0).
#
# Required environment:
#   AGENTWATCH_URL        e.g. https://pirogram-delta.vercel.app
#   AGENTWATCH_SECRET     plaintext secret shown once on /settings
#   AGENTWATCH_AGENT_NAME label this hook sends as (e.g. "PM", "BE")
#
# Optional:
#   AGENTWATCH_DEBUG=1    print payload + signature to stderr before sending
#
# Dependencies: bash, jq, openssl, curl, date (GNU/BSD), uuidgen.

set -u
set -o pipefail

# Read hook payload from stdin (Claude Code sets HOOK_EVENT_NAME for the kind).
HOOK_EVENT="${HOOK_EVENT_NAME:-unknown}"
PAYLOAD="$(cat || true)"

# Bail out cleanly when required env is missing — never block the user.
if [[ -z "${AGENTWATCH_URL:-}" || -z "${AGENTWATCH_SECRET:-}" || -z "${AGENTWATCH_AGENT_NAME:-}" ]]; then
  echo "[agentwatch] missing AGENTWATCH_URL / AGENTWATCH_SECRET / AGENTWATCH_AGENT_NAME; skipping" >&2
  exit 0
fi

UUID="$(uuidgen 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())')"
AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
AGENT="${AGENTWATCH_AGENT_NAME}"

build_message() {
  local body="$1"
  jq -c -n \
    --arg type "Message" \
    --arg eventId "$UUID" \
    --arg at "$AT" \
    --arg from "$AGENT" \
    --arg body "$body" \
    '{type:$type, eventId:$eventId, at:$at, from:$from, body:$body}'
}

build_task_created() {
  local id="$1" title="$2"
  jq -c -n \
    --arg type "TaskCreated" \
    --arg eventId "$UUID" \
    --arg at "$AT" \
    --arg from "$AGENT" \
    --arg id "$id" \
    --arg title "$title" \
    '{type:$type, eventId:$eventId, at:$at, task:{id:$id, title:$title, assignee:$from}}'
}

build_task_completed() {
  local id="$1"
  jq -c -n \
    --arg type "TaskCompleted" \
    --arg eventId "$UUID" \
    --arg at "$AT" \
    --arg taskId "$id" \
    '{type:$type, eventId:$eventId, at:$at, taskId:$taskId}'
}

build_teammate_idle() {
  jq -c -n \
    --arg type "TeammateIdle" \
    --arg eventId "$UUID" \
    --arg at "$AT" \
    --arg agent "$AGENT" \
    '{type:$type, eventId:$eventId, at:$at, agent:$agent}'
}

EVENT_JSON=""

case "$HOOK_EVENT" in
  SessionStart|SessionEnd)
    EVENT_JSON="$(build_teammate_idle)"
    ;;
  UserPromptSubmit)
    PROMPT="$(echo "$PAYLOAD" | jq -r '.prompt // .user_prompt // .text // ""' | head -c 400)"
    [[ -n "$PROMPT" ]] && EVENT_JSON="$(build_message "$PROMPT")"
    ;;
  PreToolUse)
    TOOL="$(echo "$PAYLOAD" | jq -r '.tool_name // .tool // ""')"
    if [[ "$TOOL" == "Task" ]]; then
      DESC="$(echo "$PAYLOAD" | jq -r '.tool_input.description // .tool_input.task // "subtask"' | head -c 200)"
      SESSION="$(echo "$PAYLOAD" | jq -r '.session_id // "session"')"
      EVENT_JSON="$(build_task_created "local/${SESSION}-${UUID}" "$DESC")"
    else
      EVENT_JSON="$(build_message "→ $TOOL")"
    fi
    ;;
  PostToolUse)
    TOOL="$(echo "$PAYLOAD" | jq -r '.tool_name // .tool // ""')"
    if [[ "$TOOL" == "Task" ]]; then
      # We don't have the original task id here; best-effort: emit a Message
      # so the dashboard at least logs completion in the feed.
      EVENT_JSON="$(build_message "✓ completed Task tool")"
    else
      EVENT_JSON="$(build_message "← $TOOL")"
    fi
    ;;
  Stop|SubagentStop)
    EVENT_JSON="$(build_teammate_idle)"
    ;;
  *)
    # Unknown hook event — do nothing, do not block.
    exit 0
    ;;
esac

[[ -z "$EVENT_JSON" ]] && exit 0

TS="$(date +%s)"
SIG="sha256=$(printf '%s' "$EVENT_JSON" | openssl dgst -sha256 -hmac "$AGENTWATCH_SECRET" -hex | awk '{print $2}')"

if [[ "${AGENTWATCH_DEBUG:-0}" == "1" ]]; then
  echo "[agentwatch] event=$HOOK_EVENT body=$EVENT_JSON" >&2
fi

curl -sS -m 5 -o /dev/null \
  -X POST "${AGENTWATCH_URL%/}/api/webhook/events" \
  -H "Content-Type: application/json" \
  -H "X-AgentWatch-Signature: $SIG" \
  -H "X-AgentWatch-Timestamp: $TS" \
  --data "$EVENT_JSON" \
  2>>/tmp/agentwatch-emit.err || echo "[agentwatch] POST failed; see /tmp/agentwatch-emit.err" >&2

exit 0
