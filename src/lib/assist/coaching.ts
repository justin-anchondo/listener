import { type SpeakerMap, type StatSegment, speakerLabel } from "@/lib/assist/stats";

// Speaking patterns per speaker, computed from the transcript in code, for
// coaching through the connector: pace, turns, monologues, questions,
// filler words, and cut-ins (starting while someone else is still talking).

export type SpeakerPatterns = {
  label: string;
  talkSeconds: number;
  share: number;
  words: number;
  wordsPerMinute: number | null;
  turns: number;
  longestTurnSeconds: number;
  averageTurnSeconds: number;
  questions: number;
  fillers: { total: number; per100Words: number; top: { word: string; count: number }[] };
  cutIns: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function speakingPatterns(segments: StatSegment[], map: SpeakerMap, fillerWords: string[]): SpeakerPatterns[] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  const fillers = fillerWords.map((w) => ({ word: w, re: new RegExp(`\\b${escape(w.toLowerCase())}\\b`, "g") }));
  type Acc = { ms: number; words: number; questions: number; turns: number[]; fillers: Map<string, number>; cutIns: number };
  const by = new Map<string, Acc>();
  let total = 0;
  let prev = null as { label: string; endMs: number } | null;
  let turnStart = 0;
  let turnEnd = 0;

  const acc = (label: string) => {
    let a = by.get(label);
    if (!a) by.set(label, (a = { ms: 0, words: 0, questions: 0, turns: [], fillers: new Map(), cutIns: 0 }));
    return a;
  };

  for (const s of sorted) {
    const label = speakerLabel(s.speaker, map);
    const a = acc(label);
    const ms = Math.max(0, s.endMs - s.startMs);
    a.ms += ms;
    total += ms;
    const text = s.text.toLowerCase();
    a.words += text.split(/\s+/).filter(Boolean).length;
    a.questions += (s.text.match(/\?/g) ?? []).length;
    for (const f of fillers) {
      const n = text.match(f.re)?.length ?? 0;
      if (n) a.fillers.set(f.word, (a.fillers.get(f.word) ?? 0) + n);
    }
    if (prev && prev.label === label) {
      turnEnd = Math.max(turnEnd, s.endMs);
    } else {
      if (prev) acc(prev.label).turns.push(turnEnd - turnStart);
      if (prev && s.startMs < prev.endMs) a.cutIns++;
      turnStart = s.startMs;
      turnEnd = s.endMs;
    }
    prev = { label, endMs: Math.max(s.endMs, prev?.label === label ? prev.endMs : 0) };
  }
  if (prev) acc(prev.label).turns.push(turnEnd - turnStart);

  return [...by.entries()]
    .map(([label, a]) => {
      const fillerTotal = [...a.fillers.values()].reduce((x, y) => x + y, 0);
      return {
        label,
        talkSeconds: round1(a.ms / 1000),
        share: total ? Math.round((a.ms / total) * 100) / 100 : 0,
        words: a.words,
        wordsPerMinute: a.ms >= 10_000 ? Math.round(a.words / (a.ms / 60_000)) : null,
        turns: a.turns.length,
        longestTurnSeconds: round1(Math.max(0, ...a.turns) / 1000),
        averageTurnSeconds: a.turns.length ? round1(a.turns.reduce((x, y) => x + y, 0) / a.turns.length / 1000) : 0,
        questions: a.questions,
        fillers: {
          total: fillerTotal,
          per100Words: a.words ? round1((fillerTotal / a.words) * 100) : 0,
          top: [...a.fillers.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([word, count]) => ({ word, count })),
        },
        cutIns: a.cutIns,
      };
    })
    .sort((x, y) => y.talkSeconds - x.talkSeconds);
}
