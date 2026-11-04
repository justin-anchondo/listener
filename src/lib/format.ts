// Display helpers shared by the client screens.

export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function minutesBetween(a: string | Date, b: string | Date | null): number | null {
  if (!b) return null;
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

/** Local calendar date as YYYY-MM-DD, offset by whole days. */
export function localIsoDate(offsetDays = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysUntil(iso: string | Date, now = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

export type DueGroup = "overdue" | "today" | "week" | "later" | "none" | "snoozed";

/** Groups an open item for the consolidated list. Dates are YYYY-MM-DD in local time. */
export function dueGroup(dueDate: string | null, snoozedUntil: string | null, today: string): DueGroup {
  if (snoozedUntil && snoozedUntil > today) return "snoozed";
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const week = new Date(`${today}T12:00:00`);
  week.setDate(week.getDate() + 7);
  return dueDate <= localIsoDate(0, week) ? "week" : "later";
}

export type DueTone = "overdue" | "soon" | "later" | "none" | "done";

/** The due date chip on an action item: what it says and how loud it is. */
export function dueChip(dueDate: string | null, today: string, done = false): { label: string; tone: DueTone } {
  if (done) return { label: dueDate ? fmtShort(dueDate, today) : "Done", tone: "done" };
  if (!dueDate) return { label: "+ Date", tone: "none" };
  if (dueDate < today) return { label: `Overdue · ${fmtShort(dueDate, today)}`, tone: "overdue" };
  if (dueDate === today) return { label: "Due today", tone: "soon" };
  const week = localIsoDate(7, new Date(`${today}T12:00:00`));
  if (dueDate <= week) return { label: `Due ${fmtShort(dueDate, today)}`, tone: "soon" };
  return { label: fmtShort(dueDate, today), tone: "later" };
}

/** "Fri" within the coming or past week, otherwise "Nov 14". */
export function fmtShort(isoDate: string, today: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  const days = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  if (Math.abs(days) <= 6) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Counts for the "1 overdue · 3 due this week · 2 without a date" line. */
export function dueSummary(items: { dueDate: string | null; snoozedUntil?: string | null }[], today: string) {
  let overdue = 0, week = 0, none = 0;
  for (const i of items) {
    const g = dueGroup(i.dueDate, i.snoozedUntil ?? null, today);
    if (g === "overdue") overdue++;
    else if (g === "today" || g === "week") week++;
    else if (g === "none") none++;
  }
  return { overdue, week, none };
}
