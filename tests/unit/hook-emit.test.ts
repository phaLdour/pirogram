import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentEventSchema } from "@/lib/webhook/schema";

const SCRIPT = join(process.cwd(), "docs/integrations/claude-code-hooks/agentwatch-emit.sh");

// Run the hook under a fake `curl` that just dumps the POST body to a file
// instead of hitting the network. The script itself shouldn't know.
function runHook({
  hookEvent,
  payload,
  verboseMessages,
}: {
  hookEvent: string;
  payload: object;
  verboseMessages?: boolean;
}): string[] {
  const dir = mkdtempSync(join(tmpdir(), "aw-hook-"));
  try {
    // Stub `curl` so we capture each POST body. We write each --data argument
    // to a separate file in $dir/posts so we can read them in order.
    const fakeCurl = join(dir, "curl");
    const postsDir = join(dir, "posts");
    mkdirSync(postsDir);
    writeFileSync(
      fakeCurl,
      `#!/usr/bin/env bash
# Find the --data argument and dump it to a uniquely named file.
seen_data=0
i=0
for arg in "$@"; do
  if [[ "$seen_data" == "1" ]]; then
    printf '%s' "$arg" > "${postsDir}/post-$(date +%s%N)-$$-$i.json"
    seen_data=0
  fi
  if [[ "$arg" == "--data" ]]; then
    seen_data=1
  fi
  i=$((i+1))
done
exit 0
`,
      { mode: 0o755 },
    );

    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      HOOK_EVENT_NAME: hookEvent,
      AGENTWATCH_URL: "http://localhost",
      AGENTWATCH_SECRET: "test-secret",
      AGENTWATCH_AGENT_NAME: "phaLdour",
      ...(verboseMessages ? { AGENTWATCH_VERBOSE_MESSAGES: "1" } : {}),
    };

    const result = spawnSync("bash", [SCRIPT], {
      input: JSON.stringify(payload),
      env,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);

    // Read posts in lexicographic order (filenames embed nanosecond ts).
    const files = readdirSync(postsDir).sort();
    return files.map((f) => readFileSync(join(postsDir, f), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("agentwatch-emit.sh", () => {
  it("PreToolUse on Task emits ActivityStarted + TaskCreated", () => {
    const bodies = runHook({
      hookEvent: "PreToolUse",
      payload: {
        tool_name: "Task",
        tool_use_id: "toolu_01ABC",
        session_id: "sess-1",
        tool_input: {
          subagent_type: "Explore",
          description: "Survey hooks",
          prompt: "Read the README and report findings",
        },
      },
    });

    expect(bodies.length).toBe(2);
    const parsedAll = bodies.map((b) => agentEventSchema.safeParse(JSON.parse(b)));
    for (const p of parsedAll) {
      expect(p.success).toBe(true);
    }
    const types = parsedAll
      .filter((p) => p.success)
      .map((p) => (p.success ? p.data.type : ""));
    expect(types).toContain("ActivityStarted");
    expect(types).toContain("TaskCreated");

    const activity = parsedAll
      .map((p) => (p.success ? p.data : null))
      .find((d) => d?.type === "ActivityStarted");
    if (activity?.type !== "ActivityStarted") throw new Error("expected ActivityStarted");
    expect(activity.toolName).toBe("Task");
    expect(activity.toolUseId).toBe("toolu_01ABC");
    expect(activity.subagentType).toBe("Explore");
    expect(activity.description).toBe("Survey hooks");
    expect(activity.sessionId).toBe("sess-1");
    expect(activity.agent).toBe("phaLdour");
  });

  it("PreToolUse on a non-Task tool emits ActivityStarted only (no verbose Message)", () => {
    const bodies = runHook({
      hookEvent: "PreToolUse",
      payload: {
        tool_name: "Bash",
        tool_use_id: "toolu_bash_1",
        parent_tool_use_id: "toolu_01ABC",
        session_id: "sess-1",
        tool_input: { command: "ls" },
      },
    });

    expect(bodies).toHaveLength(1);
    const parsed = agentEventSchema.safeParse(JSON.parse(bodies[0]!));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.type).toBe("ActivityStarted");
    if (parsed.data.type === "ActivityStarted") {
      expect(parsed.data.toolName).toBe("Bash");
      expect(parsed.data.parentToolUseId).toBe("toolu_01ABC");
    }
  });

  it("PreToolUse on a non-Task tool emits a verbose Message when env opts in", () => {
    const bodies = runHook({
      hookEvent: "PreToolUse",
      payload: {
        tool_name: "Bash",
        tool_use_id: "toolu_bash_2",
        tool_input: { command: "ls" },
      },
      verboseMessages: true,
    });
    expect(bodies).toHaveLength(2);
    const parsed = bodies.map((b) => agentEventSchema.safeParse(JSON.parse(b)));
    expect(parsed.every((p) => p.success)).toBe(true);
    const types = parsed.map((p) => (p.success ? p.data.type : ""));
    expect(types).toContain("ActivityStarted");
    expect(types).toContain("Message");
  });

  it("PostToolUse emits ActivityEnded with ok=true on success", () => {
    const bodies = runHook({
      hookEvent: "PostToolUse",
      payload: {
        tool_name: "Bash",
        tool_use_id: "toolu_bash_3",
        tool_response: { is_error: false, content: "ok" },
      },
    });
    expect(bodies).toHaveLength(1);
    const parsed = agentEventSchema.safeParse(JSON.parse(bodies[0]!));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "ActivityEnded") {
      expect(parsed.data.ok).toBe(true);
      expect(parsed.data.toolUseId).toBe("toolu_bash_3");
    }
  });

  it("PostToolUse emits ok=false when tool_response.is_error is true", () => {
    const bodies = runHook({
      hookEvent: "PostToolUse",
      payload: {
        tool_name: "Bash",
        tool_use_id: "toolu_bash_err",
        tool_response: { is_error: true, content: "boom" },
      },
    });
    const parsed = agentEventSchema.safeParse(JSON.parse(bodies[0]!));
    if (parsed.success && parsed.data.type === "ActivityEnded") {
      expect(parsed.data.ok).toBe(false);
    }
  });
});
