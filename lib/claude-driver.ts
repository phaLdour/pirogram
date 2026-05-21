import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { CLAUDE_MODEL, SPRINT_COPILOT_SYSTEM, getAnthropic } from "@/lib/anthropic";
import { log } from "@/lib/log";

type SprintWithRepos = {
  name: string;
  goal: string | null;
  version: string | null;
};

type DriveResult =
  | { ok: true; reply: string; tasksProposed: string[] }
  | { ok: false; error: string };

const MAX_TURNS_PER_REQUEST = 1; // one user turn per HTTP request — Vercel timeout safety
const MAX_TOKENS = 16_000;

function buildContextBlock(sprint: SprintWithRepos, repos: string[]): string {
  const lines: string[] = ["Sprint context:"];
  lines.push(`- Name: ${sprint.name}`);
  if (sprint.goal) lines.push(`- Goal: ${sprint.goal}`);
  if (sprint.version) lines.push(`- Current version: ${sprint.version}`);
  if (repos.length > 0) {
    lines.push(`- Bound repositories: ${repos.join(", ")}`);
  } else {
    lines.push("- Bound repositories: (none — bind one on /repos first)");
  }
  return lines.join("\n");
}

function parseTaskBlock(text: string): string[] {
  const idx = text.indexOf("TASKS:");
  if (idx === -1) return [];
  const tail = text.slice(idx);
  const lines = tail.split("\n").slice(1); // skip "TASKS:" line itself
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (out.length > 0) break;
      continue;
    }
    const match = line.match(/^-\s*T-\d+:\s*(.+)$/);
    if (!match) break;
    out.push(match[1]!.trim());
  }
  return out;
}

export async function driveSprintTurn(
  sprintId: string,
  userMessage: string,
): Promise<DriveResult> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { id: true, name: true, goal: true, version: true, claudeEnabled: true },
  });
  if (!sprint) return { ok: false, error: "sprint-not-found" };
  if (!sprint.claudeEnabled) return { ok: false, error: "claude-not-enabled" };

  let anthropic: Anthropic;
  try {
    anthropic = getAnthropic();
  } catch (err) {
    log.error("claude.no-api-key", err, { sprintId });
    return { ok: false, error: "anthropic-not-configured" };
  }

  // Pull bound repos to enrich the first turn's context.
  const boundRepos = await prisma.repo.findMany({
    where: { revokedAt: null },
    select: { fullName: true },
    orderBy: { fullName: "asc" },
  });
  const repoNames = boundRepos.map((r) => r.fullName);

  // Load conversation history. The first user turn embeds the sprint context;
  // subsequent turns are bare user messages. We always send the full history
  // so Claude has continuity, and rely on prompt caching of the system prompt
  // to keep cost low.
  const history = await prisma.claudeMessage.findMany({
    where: { sprintId },
    orderBy: { createdAt: "asc" },
  });

  const isFirstTurn = history.length === 0;
  const userPayload = isFirstTurn
    ? `${buildContextBlock(sprint, repoNames)}\n\n---\n\nGoal: ${userMessage}`
    : userMessage;

  // Persist the user turn BEFORE the API call so the conversation log is
  // append-only even on a Claude failure.
  await prisma.claudeMessage.create({
    data: { sprintId, role: "USER", content: userPayload },
  });

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user", content: userPayload },
  ];

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      // Cache the (large, stable) system prompt across every turn of this
      // sprint's conversation. Subsequent turns pay ~0.1× for the system
      // tokens instead of full price.
      system: [
        {
          type: "text",
          text: SPRINT_COPILOT_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      // Adaptive thinking is the right default for planning — Claude
      // decides how much to think per turn.
      thinking: { type: "adaptive" },
      messages,
    });
  } catch (err) {
    log.error("claude.api-failed", err, { sprintId });
    return { ok: false, error: "anthropic-api-failed" };
  }

  // Extract assistant text. Adaptive thinking blocks can be present too —
  // we don't surface them in the chat UI (default `display: "omitted"`
  // returns empty thinking text on Opus 4.7, which is fine for our use).
  const replyText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!replyText) {
    log.warn("claude.empty-reply", { sprintId, stopReason: response.stop_reason });
    return { ok: false, error: "anthropic-empty-reply" };
  }

  const tasksProposed = parseTaskBlock(replyText);

  await prisma.claudeMessage.create({
    data: {
      sprintId,
      role: "ASSISTANT",
      content: replyText,
      model: response.model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      tokensCacheR: response.usage.cache_read_input_tokens ?? null,
      tokensCacheW: response.usage.cache_creation_input_tokens ?? null,
    },
  });

  log.info("claude.turn", {
    sprintId,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens,
    cacheWrite: response.usage.cache_creation_input_tokens,
    tasksProposed: tasksProposed.length,
    stopReason: response.stop_reason,
  });

  return { ok: true, reply: replyText, tasksProposed };
}

// Silence the unused-MAX_TURNS warning by exporting it for tests.
export const _config = { MAX_TURNS_PER_REQUEST };
