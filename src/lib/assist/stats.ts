// Talk time and question counts, computed from the transcript in code so the
// numbers in the feedback are exact rather than estimated by the model.

export type StatSegment = { speaker: number | null; startMs: number; endMs: number; text: string };
export type SpeakerMap = Record<string, string>; // "0" -> "Me", "1" -> "Dana"

export type TalkStats = {
  totalMs: number;
  speakers: { label: string; ms: number; share: number; questions: number }[];
  me: { share: number; questions: number } | null; // null until a speaker is mapped to "Me"
};

export const ME = "Me";

export function speakerLabel(speaker: number | null, map: SpeakerMap): string {
  if (speaker === null) return "Speaker";
  return map[String(speaker)]?.trim() || `Speaker ${speaker + 1}`;
}

function questions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

export function talkStats(segments: StatSegment[], map: SpeakerMap): TalkStats {
  const by = new Map<string, { ms: number; questions: number }>();
  let total = 0;
  for (const s of segments) {
    const ms = Math.max(0, s.endMs - s.startMs);
    const label = speakerLabel(s.speaker, map);
    const cur = by.get(label) ?? { ms: 0, questions: 0 };
    cur.ms += ms;
    cur.questions += questions(s.text);
    by.set(label, cur);
    total += ms;
  }
  const speakers = [...by.entries()]
    .map(([label, v]) => ({ label, ms: v.ms, share: total ? Math.round((v.ms / total) * 100) / 100 : 0, questions: v.questions }))
    .sort((a, b) => b.ms - a.ms);
  const me = speakers.find((s) => s.label === ME);
  return { totalMs: total, speakers, me: me ? { share: me.share, questions: me.questions } : null };
}
