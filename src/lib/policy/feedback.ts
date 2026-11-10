import { LimitError } from "@/lib/policy/limits";

// What the owner can say about a removed task or tip. Validated here so a
// route can't store anything but these fixed values; no free text.

export const TASK_REASONS = ["not_mine", "not_a_task", "too_vague", "duplicate", "other"] as const;
export const TIP_REASONS = ["not_useful", "already_known", "wrong", "other"] as const;
export type FeedbackKind = "task" | "tip";
export type FeedbackReason = (typeof TASK_REASONS)[number] | (typeof TIP_REASONS)[number];

/** A reason for this kind, or null when none was given; anything else is refused. */
export function cleanFeedbackReason(kind: FeedbackKind, value: unknown): FeedbackReason | null {
  if (value === undefined || value === null || value === "") return null;
  const allowed: readonly string[] = kind === "task" ? TASK_REASONS : TIP_REASONS;
  if (typeof value !== "string" || !allowed.includes(value)) throw new LimitError("reason");
  return value as FeedbackReason;
}

/** Tip feedback follows the transcript; task feedback lasts longer. */
export function feedbackExpiresAt(kind: FeedbackKind, now: Date, days: { task: number; tip: number }): Date {
  const d = kind === "task" ? days.task : days.tip;
  if (!Number.isFinite(d) || d <= 0) throw new Error("feedback days must be positive");
  return new Date(now.getTime() + d * 86_400_000);
}
