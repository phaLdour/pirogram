import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/time/duration";

describe("formatDuration", () => {
  it("renders sub-second as ms", () => {
    expect(formatDuration(1000, 1120, 99999)).toBe("120ms");
  });

  it("renders seconds when at least 1s", () => {
    expect(formatDuration(0, 3500, 99999)).toBe("3s");
  });

  it("renders minutes + seconds", () => {
    expect(formatDuration(0, 75_000, 99999)).toBe("1m15s");
  });

  it("renders whole minutes without trailing 0s", () => {
    expect(formatDuration(0, 60_000, 99999)).toBe("1m");
  });

  it("renders hours + minutes", () => {
    expect(formatDuration(0, 3 * 3600_000 + 5 * 60_000, 99999)).toBe("3h5m");
  });

  it("uses nowMs when endedAt is null (running activity)", () => {
    expect(formatDuration(1000, null, 4000)).toBe("3s");
  });

  it("clamps negative durations to zero", () => {
    expect(formatDuration(5000, 1000, 99999)).toBe("0ms");
  });
});
