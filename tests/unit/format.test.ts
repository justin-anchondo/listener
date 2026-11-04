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

import { dueChip, dueSummary, fmtShort } from "@/lib/format";

describe("due chips", () => {
  const today = "2026-11-04"; // Wednesday
  it("labels overdue, soon, later, and undated items", () => {
    expect(dueChip("2026-11-02", today)).toEqual({ label: "Overdue · Mon", tone: "overdue" });
    expect(dueChip("2026-11-04", today)).toEqual({ label: "Due today", tone: "soon" });
    expect(dueChip("2026-11-06", today)).toEqual({ label: "Due Fri", tone: "soon" });
    expect(dueChip("2026-11-20", today)).toEqual({ label: "Nov 20", tone: "later" });
    expect(dueChip(null, today)).toEqual({ label: "+ Date", tone: "none" });
    expect(dueChip("2026-11-02", today, true).tone).toBe("done");
  });

  it("formats short dates", () => {
    expect(fmtShort("2026-11-06", "2026-11-04")).toBe("Fri");
    expect(fmtShort("2026-12-01", "2026-11-04")).toBe("Dec 1");
  });

  it("summarizes counts and ignores snoozed items", () => {
    const s = dueSummary([
      { dueDate: "2026-11-01" },
      { dueDate: "2026-11-05" },
      { dueDate: "2026-11-04" },
      { dueDate: null },
      { dueDate: "2026-11-01", snoozedUntil: "2026-11-10" },
    ], "2026-11-04");
    expect(s).toEqual({ overdue: 1, week: 2, none: 1 });
  });
});

import { initials } from "@/components/app/client-avatar";

describe("initials", () => {
  it("takes up to two letters", () => {
    expect(initials("Acme Corp")).toBe("AC");
    expect(initials("northwind")).toBe("N");
    expect(initials("  ")).toBe("?");
  });
});
