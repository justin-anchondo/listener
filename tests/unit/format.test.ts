import { describe, expect, it } from "vitest";
import { clock, dueGroup, localIsoDate, minutesBetween } from "@/lib/format";

describe("format", () => {
  it("formats clocks", () => {
    expect(clock(65)).toBe("01:05");
    expect(clock(3725)).toBe("1:02:05");
  });

  it("computes durations", () => {
    expect(minutesBetween("2026-11-04T10:00:00Z", "2026-11-04T10:42:10Z")).toBe(42);
    expect(minutesBetween("2026-11-04T10:00:00Z", null)).toBeNull();
  });

  it("offsets local dates", () => {
    expect(localIsoDate(1, new Date(2026, 11, 31))).toBe("2027-01-01");
  });

  it("groups open items by due date", () => {
    const today = "2026-11-04";
    expect(dueGroup("2026-11-01", null, today)).toBe("overdue");
    expect(dueGroup("2026-11-04", null, today)).toBe("today");
    expect(dueGroup("2026-11-11", null, today)).toBe("week");
    expect(dueGroup("2026-11-12", null, today)).toBe("later");
    expect(dueGroup(null, null, today)).toBe("none");
    expect(dueGroup("2026-11-01", "2026-11-10", today)).toBe("snoozed");
    expect(dueGroup("2026-11-01", "2026-11-04", today)).toBe("overdue");
  });
});
