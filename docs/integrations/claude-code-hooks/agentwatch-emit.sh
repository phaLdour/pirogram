#!/usr/bin/env bash
# AgentWatch — Claude Code hook adapter.
#
# Reads a Claude Code hook payload from stdin, translates it to AgentWatch
# event(s), HMAC-signs each, and POSTs to /api/webhook/events. Failures are
# logged to stderr and never block Claude Code (always exits 0).
#
# Required environment:
#   AGENTWATCH_URL        e.g. https://pirogram-delta.vercel.app
#   AGENTWATCH_SECRET     plaintext secret shown once on /settings
#   AGENTWATCH_AGENT_NAME label this hook sends as (e.g. "PM", "BE")
#
# Optional:
#   AGENTWATCH_DEBUG=1               print payload + signature to stderr
#   AGENTWATCH_VERBOSE_MESSAGES=1    emit a "→ ToolName" / "← ToolName"
#                                    Message for every PreToolUse/PostToolUse
#                                    (off by default; the dashboard now shows
#                                    these structurally via Activity rows).
#
# Dependencies: bash, jq, openssl, curl, date (GNU/BSD), uuidgen.

set -u
set -o pipefail

HOOK_EVENT="${HOOK_EVENT_NAME:-unknown}"
PAYLOAD="$(cat || true)"

if [[ -z "${AGENTWATCH_URL:-}" || -z "${AGENTWATCH_SECRET:-}" || -z "${AGENTWATCH_AGENT_NAME:-}" ]]; then
  echo "[agentwatch] missing AGENTWATCH_URL / AGENTWATCH_SECRET / AGENTWATCH_AGENT_NAME; skipping" >&2
  exit 0
fi

AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
AGENT="${AGENTWATCH_AGENT_NAME}"

gen_uuid() {
  uuidgen 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())'
}

post_event() {
  local body="$1"
  local ts
  ts="$(date +%s)"
  local sig
  sig="sha256=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$AGENTWATCH_SECRET" -hex | awk '{print $2}')"
  if [[ "${AGENTWATCH_DEBUG:-0}" == "1" ]]; then
    echo "[agentwatch] event=$HOOK_EVENT body=$body" >&2
  fi
  curl -sS -m 5 -o /dev/null \
    -X POST "${AGENTWATCH_URL%/}/api/webhook/events" \
    -H "Content-Type: application/json" \
    -H "X-AgentWatch-Signature: $sig" \
    -H "X-AgentWatch-Timestamp: $ts" \
    --data "$body" \
    2>>/tmp/agentwatch-emit.err || echo "[agentwatch] POST failed; see /tmp/agentwatch-emit.err" >&2
}

build_message() {
  local body="$1"
  jq -c -n \
    --arg type "Message" \
    --arg eventId "$(gen_uuid)" \
    --arg at "$AT" \
    --arg from "$AGENT" \
    --arg body "$body" \
    '{type:$type, eventId:$eventId, at:$at, from:$from, body:$body}'
}

build_task_created() {
  local id="$1" title="$2"
  jq -c -n \
    --arg type "TaskCreated" \
    --arg eventId "$(gen_uuid)" \
    --arg at "$AT" \
    --arg from "$AGENT" \
    --arg id "$id" \
    --arg title "$title" \
    '{type:$type, eventId:$eventId, at:$at, task:{id:$id, title:$title, assignee:$from}}'
}

build_teammate_idle() {
  jq -c -n \
    --arg type "TeammateIdle" \
    --arg eventId "$(gen_uuid)" \
    --arg at "$AT" \
    --arg agent "$AGENT" \
    '{type:$type, eventId:$eventId, at:$at, agent:$agent}'
}

build_activity_started() {
  # Args: tool_use_id, tool_name, parent_tool_use_id, subagent_type, description, session_id
  local toolUseId="$1" toolName="$2" parentToolUseId="$3" subagentType="$4" description="$5" sessionId="$6"
  jq -c -n \
    --arg type "ActivityStarted" \
    --arg eventId "$(gen_uuid)" \
    --arg at "$AT" \
    --arg agent "$AGENT" \
    --arg toolUseId "$toolUseId" \
    --arg toolName "$toolName" \
    --arg parentToolUseId "$parentToolUseId" \
    --arg subagentType "$subagentType" \
    --arg description "$description" \
    --arg sessionId "$sessionId" \
    '{type:$type, eventId:$eventId, at:$at, agent:$agent, toolUseId:$toolUseId, toolName:$toolName}
     + (if $parentToolUseId == "" then {} else {parentToolUseId:$parentToolUseId} end)
     + (if $subagentType    == "" then {} else {subagentType:$subagentType}       end)
     + (if $description     == "" then {} else {description:$description}         end)
     + (if $sessionId       == "" then {} else {sessionId:$sessionId}             end)'
}

build_activity_ended() {
  local toolUseId="$1" okFlag="$2"
  jq -c -n \
    --arg type "ActivityEnded" \
    --arg eventId "$(gen_uuid)" \
    --arg at "$AT" \
    --arg toolUseId "$toolUseId" \
    --arg ok "$okFlag" \
    '{type:$type, eventId:$eventId, at:$at, toolUseId:$toolUseId}
     + (if $ok == "true" then {ok:true} elif $ok == "false" then {ok:false} else {} end)'
}

case "$HOOK_EVENT" in
  SessionStart|SessionEnd)
    post_event "$(build_teammate_idle)"
    ;;
  UserPromptSubmit)
    PROMPT="$(echo "$PAYLOAD" | jq -r '.prompt // .user_prompt // .text // ""' | head -c 400)"
    [[ -n "$PROMPT" ]] && post_event "$(build_message "$PROMPT")"
    ;;
  PreToolUse)
    TOOL="$(echo "$PAYLOAD" | jq -r '.tool_name // .tool // ""')"
    TOOL_USE_ID="$(echo "$PAYLOAD" | jq -r '.tool_use_id // ""')"
    PARENT_TOOL_USE_ID="$(echo "$PAYLOAD" | jq -r '.parent_tool_use_id // ""')"
    SESSION_ID="$(echo "$PAYLOAD" | jq -r '.session_id // ""')"
    SUBAGENT_TYPE=""
    DESC=""
    if [[ "$TOOL" == "Task" ]]; then
      SUBAGENT_TYPE="$(echo "$PAYLOAD" | jq -r '.tool_input.subagent_type // ""' | head -c 100)"
      DESC="$(echo "$PAYLOAD" | jq -r '.tool_input.description // .tool_input.task // "subtask"' | head -c 200)"
    fi
    if [[ -n "$TOOL_USE_ID" && -n "$TOOL" ]]; then
      post_event "$(build_activity_started "$TOOL_USE_ID" "$TOOL" "$PARENT_TOOL_USE_ID" "$SUBAGENT_TYPE" "$DESC" "$SESSION_ID")"
    fi
    if [[ "$TOOL" == "Task" ]]; then
      LABEL="${DESC:-subtask}"
      post_event "$(build_task_created "local/${SESSION_ID}-$(gen_uuid)" "$LABEL")"
    elif [[ "${AGENTWATCH_VERBOSE_MESSAGES:-0}" == "1" ]]; then
      post_event "$(build_message "→ $TOOL")"
    fi
    ;;
  PostToolUse)
    TOOL="$(echo "$PAYLOAD" | jq -r '.tool_name // .tool // ""')"
    TOOL_USE_ID="$(echo "$PAYLOAD" | jq -r '.tool_use_id // ""')"
    OK_FLAG="$(echo "$PAYLOAD" | jq -r 'if .error then "false" elif .tool_response.is_error == true then "false" else "true" end')"
    if [[ -n "$TOOL_USE_ID" ]]; then
      post_event "$(build_activity_ended "$TOOL_USE_ID" "$OK_FLAG")"
    fi
    if [[ "${AGENTWATCH_VERBOSE_MESSAGES:-0}" == "1" ]]; then
      if [[ "$TOOL" == "Task" ]]; then
        post_event "$(build_message "✓ completed Task tool")"
      else
        post_event "$(build_message "← $TOOL")"
      fi
    fi
    ;;
  Stop|SubagentStop)
    post_event "$(build_teammate_idle)"
    ;;
  *)
    exit 0
    ;;
esac

exit 0
