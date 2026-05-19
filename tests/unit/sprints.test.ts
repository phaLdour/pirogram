import { describe, expect, it } from "vitest";
import type { Task } from "@prisma/client";
import {
  bumpVersion,
  detectBump,
  formatChangelogMarkdown,
  groupTasksForChangelog,
  parseVersion,
} from "@/lib/sprints";

function task(id: string, title: string, status: Task["status"] = "DONE"): Task {
  return {
    id,
    title,
    description: null,
    status,
    assigneeId: null,
    sprintId: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    completedAt: new Date("2026-05-02T00:00:00Z"),
  };
}

describe("sprints/parseVersion", () => {
  it("defaults to 0.1.0 when missing or invalid", () => {
    expect(parseVersion(null)).toEqual([0, 1, 0]);
    expect(parseVersion("")).toEqual([0, 1, 0]);
    expect(parseVersion("garbage")).toEqual([0, 1, 0]);
  });

  it("parses with or without the v prefix", () => {
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });
});

describe("sprints/bumpVersion", () => {
  it("bumps minor from a fresh repo to v0.2.0", () => {
    expect(bumpVersion(null, "minor")).toBe("v0.2.0");
  });
  it("bumps major, minor, and patch independently and resets lower segments", () => {
    expect(bumpVersion("v1.2.3", "major")).toBe("v2.0.0");
    expect(bumpVersion("v1.2.3", "minor")).toBe("v1.3.0");
    expect(bumpVersion("v1.2.3", "patch")).toBe("v1.2.4");
  });
});

describe("sprints/detectBump", () => {
  it("returns the explicit bump when not 'auto'", () => {
    expect(detectBump([], "major")).toBe("major");
    expect(detectBump([task("T-1", "feat: x")], "patch")).toBe("patch");
  });
  it("auto-detects major from a breaking-change marker", () => {
    expect(detectBump([task("T-1", "feat!: drop legacy")], "auto")).toBe("major");
  });
  it("auto-detects minor when any feat: is present", () => {
    expect(detectBump([task("T-1", "fix: y"), task("T-2", "feat: z")], "auto")).toBe("minor");
  });
  it("falls back to patch", () => {
    expect(detectBump([task("T-1", "chore: bump deps")], "auto")).toBe("patch");
  });
});

describe("sprints/groupTasksForChangelog", () => {
  it("groups by Conventional Commit type", () => {
    const groups = groupTasksForChangelog([
      task("T-1", "feat: a"),
      task("T-2", "fix: b"),
      task("T-3", "anything goes"),
      task("T-4", "feat!: hard"),
    ]);
    const headings = groups.map((g) => g.heading);
    expect(headings).toContain("Breaking changes");
    expect(headings).toContain("Features");
    expect(headings).toContain("Fixes");
    expect(headings).toContain("Tasks");
  });
});

describe("sprints/formatChangelogMarkdown", () => {
  const sprint = {
    name: "Q3-W1",
    version: "v0.2.0",
    startedAt: new Date("2026-05-01T00:00:00Z"),
    endedAt: new Date("2026-05-08T00:00:00Z"),
  };

  it("renders an empty-state message when no tasks", () => {
    const out = formatChangelogMarkdown(sprint, []);
    expect(out).toContain("v0.2.0 — Q3-W1");
    expect(out).toContain("_No completed tasks._");
  });

  it("renders headings and task references", () => {
    const out = formatChangelogMarkdown(sprint, [
      task("T-1", "feat: live dashboard"),
      task("T-2", "fix: replay window off-by-one"),
    ]);
    expect(out).toContain("## Features");
    expect(out).toContain("- live dashboard (`T-1`)");
    expect(out).toContain("## Fixes");
    expect(out).toContain("- replay window off-by-one (`T-2`)");
  });
});
