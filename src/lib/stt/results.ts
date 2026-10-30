// Parses Deepgram streaming "Results" messages into speaker runs.

export type Segment = {
  speaker: number | null;
  text: string;
  startSec: number; // relative to the start of this socket's audio
  endSec: number;
};

export type ParsedResult = {
  isFinal: boolean;
  segments: Segment[];
  audioEndSec: number; // start + duration of the result window
};

type Word = { word: string; punctuated_word?: string; start: number; end: number; speaker?: number };

type ResultsMessage = {
  type: "Results";
  is_final?: boolean;
  start: number;
  duration: number;
  channel: { alternatives: { transcript: string; words?: Word[] }[] };
};

function isResults(msg: unknown): msg is ResultsMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Partial<ResultsMessage>;
  return m.type === "Results" && typeof m.start === "number" && typeof m.duration === "number"
    && Array.isArray(m.channel?.alternatives);
}

export function parseResult(msg: unknown): ParsedResult | null {
  if (!isResults(msg)) return null;
  const alt = msg.channel.alternatives[0];
  const audioEndSec = msg.start + msg.duration;
  const isFinal = msg.is_final === true;
  if (!alt || alt.transcript.trim() === "") return { isFinal, segments: [], audioEndSec };

  const words = alt.words ?? [];
  if (words.length === 0) {
    return {
      isFinal,
      audioEndSec,
      segments: [{ speaker: null, text: alt.transcript, startSec: msg.start, endSec: audioEndSec }],
    };
  }

  const segments: Segment[] = [];
  for (const w of words) {
    const speaker = w.speaker ?? null;
    const text = w.punctuated_word ?? w.word;
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) {
      last.text += ` ${text}`;
      last.endSec = w.end;
    } else {
      segments.push({ speaker, text, startSec: w.start, endSec: w.end });
    }
  }
  return { isFinal, segments, audioEndSec };
}
