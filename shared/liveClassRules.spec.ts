import { describe, expect, it } from "vitest";
import { hasValidLiveClassDuration, LIVE_CLASS_DURATION_MINUTES } from "./liveClassRules.js";

describe("live class duration", () => {
  it("uses the required 40-minute duration", () => {
    expect(LIVE_CLASS_DURATION_MINUTES).toBe(40);
    expect(hasValidLiveClassDuration("2026-11-25T10:00:00.000Z", "2026-11-25T10:40:00.000Z")).toBe(true);
  });

  it.each([15, 39, 41, 60])("rejects a %i-minute class", (minutes) => {
    const start = new Date("2026-11-25T10:00:00.000Z");
    const end = new Date(start.getTime() + minutes * 60_000);
    expect(hasValidLiveClassDuration(start, end)).toBe(false);
  });

  it("rejects invalid or reversed time windows", () => {
    expect(hasValidLiveClassDuration("not-a-date", "2026-11-25T10:40:00.000Z")).toBe(false);
    expect(hasValidLiveClassDuration("2026-11-25T10:40:00.000Z", "2026-11-25T10:00:00.000Z")).toBe(false);
  });
});
