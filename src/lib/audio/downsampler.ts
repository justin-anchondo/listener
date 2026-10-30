// Converts the mic's native float samples (often 48 kHz on iPhone) to 16 bit
// PCM at the transcription rate. Keeps fractional position across calls so
// chunk boundaries don't drift or click.

export class Downsampler {
  private readonly ratio: number;
  private rest = new Float32Array(0);
  private offset = 0;

  constructor(inputRate: number, outputRate: number) {
    if (outputRate > inputRate) throw new Error("Downsampler cannot upsample");
    this.ratio = inputRate / outputRate;
  }

  process(input: Float32Array): Int16Array {
    const buf = new Float32Array(this.rest.length + input.length);
    buf.set(this.rest);
    buf.set(input, this.rest.length);

    const out: number[] = [];
    let pos = this.offset;
    while (pos + this.ratio <= buf.length) {
      const s = Math.floor(pos);
      const e = Math.max(s + 1, Math.floor(pos + this.ratio));
      let sum = 0;
      for (let i = s; i < e; i++) sum += buf[i];
      out.push(toInt16(sum / (e - s)));
      pos += this.ratio;
    }

    const keep = Math.floor(pos);
    this.rest = buf.slice(keep);
    this.offset = pos - keep;
    return Int16Array.from(out);
  }
}

export function toInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

/** Root mean square level of a frame, 0 to 1. Used for the level meter only. */
export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (const v of frame) sum += v * v;
  return Math.sqrt(sum / frame.length);
}
