import type { Task } from "@prisma/client";

export type Bump = "major" | "minor" | "patch";

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(input: string | null | undefined): [number, number, number] {
  if (!input) return [0, 1, 0];
  const m = SEMVER_RE.exec(input.trim());
  if (!m) return [0, 1, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function bumpVersion(prev: string | null | undefined, bump: Bump): string {
  const [maj, min, pat] = parseVersion(prev);
  switch (bump) {
    case "major":
      return `v${maj + 1}.0.0`;
    case "minor":
      return `v${maj}.${min + 1}.0`;
    case "patch":
      return `v${maj}.${min}.${pat + 1}`;
  }
}

const CONVENTIONAL_RE = /^(feat|fix|chore|docs|refactor|perf|test|build|ci|style|revert)(\([^)]+\))?(!)?:\s*(.+)$/i;

export type ChangelogGroup = {
  heading: string;
  items: { id: string; title: string }[];
};

export function groupTasksForChangelog(tasks: Task[]): ChangelogGroup[] {
  const groups = new Map<string, ChangelogGroup["items"]>();
  function push(heading: string, item: { id: string; title: string }) {
    const arr = groups.get(heading) ?? [];
    arr.push(item);
    groups.set(heading, arr);
  }

  for (const t of tasks) {
    const m = CONVENTIONAL_RE.exec(t.title);
    if (m) {
      const type = (m[1] ?? "other").toLowerCase();
      const breaking = m[3] === "!";
      const subject = m[4] ?? t.title;
      if (breaking) {
        push("Breaking changes", { id: t.id, title: subject });
        continue;
      }
      switch (type) {
        case "feat":
          push("Features", { id: t.id, title: subject });
          break;
        case "fix":
          push("Fixes", { id: t.id, title: subject });
          break;
        case "perf":
          push("Performance", { id: t.id, title: subject });
          break;
        case "refactor":
          push("Refactors", { id: t.id, title: subject });
          break;
        case "docs":
          push("Docs", { id: t.id, title: subject });
          break;
        default:
          push("Other", { id: t.id, title: subject });
      }
    } else {
      push("Tasks", { id: t.id, title: t.title });
    }
  }

  const order = [
    "Breaking changes",
    "Features",
    "Fixes",
    "Performance",
    "Refactors",
    "Docs",
    "Tasks",
    "Other",
  ];
  return order
    .filter((h) => groups.has(h))
    .map((heading) => ({ heading, items: groups.get(heading) ?? [] }));
}

export function formatChangelogMarkdown(
  sprint: { name: string; version: string; startedAt: Date; endedAt: Date },
  tasks: Task[],
): string {
  const lines: string[] = [];
  lines.push(`# ${sprint.version} — ${sprint.name}`);
  lines.push("");
  lines.push(
    `_${sprint.startedAt.toISOString().slice(0, 10)} → ${sprint.endedAt.toISOString().slice(0, 10)}_`,
  );
  lines.push("");

  if (tasks.length === 0) {
    lines.push("_No completed tasks._");
    return lines.join("\n");
  }

  for (const group of groupTasksForChangelog(tasks)) {
    lines.push(`## ${group.heading}`);
    for (const item of group.items) {
      lines.push(`- ${item.title} (\`${item.id}\`)`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function detectBump(tasks: Task[], explicit: Bump | "auto"): Bump {
  if (explicit !== "auto") return explicit;
  let hasBreaking = false;
  let hasFeat = false;
  for (const t of tasks) {
    const m = CONVENTIONAL_RE.exec(t.title);
    if (!m) continue;
    if (m[3] === "!") hasBreaking = true;
    if ((m[1] ?? "").toLowerCase() === "feat") hasFeat = true;
  }
  if (hasBreaking) return "major";
  if (hasFeat) return "minor";
  return "patch";
}
