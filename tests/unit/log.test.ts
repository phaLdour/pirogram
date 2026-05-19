import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentRequestId, generateRequestId, log, withRequestContext } from "@/lib/log";

type Captured = { stream: "stdout" | "stderr"; line: ReturnType<typeof JSON.parse> };

let captured: Captured[] = [];
let origWrite: typeof process.stdout.write;
let origWarn: typeof console.warn;
let origError: typeof console.error;
let origLevel: string | undefined;

beforeEach(() => {
  captured = [];
  origLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "debug";
  origWrite = process.stdout.write;
  origWarn = console.warn;
  origError = console.error;
  // Capture each emitted JSON line, keeping the test's own writes ordered.
  process.stdout.write = ((chunk: string | Uint8Array) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      try {
        captured.push({ stream: "stdout", line: JSON.parse(raw) });
      } catch {
        /* ignore non-JSON */
      }
    }
    return true;
  }) as typeof process.stdout.write;
  console.warn = ((arg: string) => {
    captured.push({ stream: "stderr", line: JSON.parse(arg) });
  }) as typeof console.warn;
  console.error = ((arg: string) => {
    captured.push({ stream: "stderr", line: JSON.parse(arg) });
  }) as typeof console.error;
});

afterEach(() => {
  process.stdout.write = origWrite;
  console.warn = origWarn;
  console.error = origError;
  if (origLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = origLevel;
  vi.restoreAllMocks();
});

describe("lib/log", () => {
  it("emits JSON lines with timestamp, level, and message", () => {
    log.info("hello", { count: 3 });
    expect(captured).toHaveLength(1);
    const line = captured[0]?.line ?? {};
    expect(line.level).toBe("info");
    expect(line.msg).toBe("hello");
    expect(line.count).toBe(3);
    expect(typeof line.t).toBe("string");
  });

  it("attaches requestId from the surrounding async context", async () => {
    await withRequestContext({ requestId: "req-abc", route: "POST /x" }, () => {
      log.warn("inside");
      return undefined;
    });
    log.warn("outside");

    expect(captured.map((c) => c.line.requestId)).toEqual(["req-abc", undefined]);
    expect(captured[0]?.line.route).toBe("POST /x");
  });

  it("serializes Error instances with name, message, and a clipped stack", () => {
    log.error("oops", new Error("boom"));
    const line = captured[0]?.line;
    expect(line?.level).toBe("error");
    expect(line?.err.name).toBe("Error");
    expect(line?.err.message).toBe("boom");
    expect(typeof line?.err.stack).toBe("string");
  });

  it("merges plain-object error context without wrapping", () => {
    log.error("oops", { code: "E_X", retriable: false });
    expect(captured[0]?.line.code).toBe("E_X");
    expect(captured[0]?.line.retriable).toBe(false);
    expect(captured[0]?.line.err).toBeUndefined();
  });

  it("respects LOG_LEVEL to drop debug lines below info", () => {
    process.env.LOG_LEVEL = "info";
    log.debug("ignored");
    log.info("kept");
    expect(captured.map((c) => c.line.msg)).toEqual(["kept"]);
  });

  it("generateRequestId returns 16 hex chars", () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("currentRequestId is undefined outside of withRequestContext", () => {
    expect(currentRequestId()).toBeUndefined();
  });
});
