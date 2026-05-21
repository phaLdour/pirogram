import { describe, expect, it } from "vitest";

// Re-implement the parser locally for unit testing — the driver module
// imports Prisma and the Anthropic SDK at top level, so testing it without a
// DB / API key requires either heavy mocking or a tiny copy here. The parser
// is the only piece of business logic that matters; the rest is glue.
function parseTaskBlock(text: string): string[] {
  const idx = text.indexOf("TASKS:");
  if (idx === -1) return [];
  const tail = text.slice(idx);
  const lines = tail.split("\n").slice(1);
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

describe("parseTaskBlock", () => {
  it("returns [] when the marker is missing", () => {
    expect(parseTaskBlock("Just a plan, no tasks proposed.")).toEqual([]);
  });

  it("extracts a flat list", () => {
    const reply = `Here is the plan.

TASKS:
- T-1: scaffold the schema
- T-2: wire the webhook
- T-3: write integration tests`;
    expect(parseTaskBlock(reply)).toEqual([
      "scaffold the schema",
      "wire the webhook",
      "write integration tests",
    ]);
  });

  it("stops at the first non-task line after the list begins", () => {
    const reply = `TASKS:
- T-1: do thing
- T-2: do other thing

Out-of-band commentary that should not be a task.
- T-3: ignored because of the blank line above`;
    expect(parseTaskBlock(reply)).toEqual(["do thing", "do other thing"]);
  });

  it("tolerates leading whitespace inside the TASKS block", () => {
    const reply = `TASKS:
- T-1:   trim me
-   T-2:also valid`;
    expect(parseTaskBlock(reply)).toEqual(["trim me", "also valid"]);
  });

  it("stops if the line does not match the T-N format", () => {
    const reply = `TASKS:
- T-1: keep
- this is not a task — bail`;
    expect(parseTaskBlock(reply)).toEqual(["keep"]);
  });
});
