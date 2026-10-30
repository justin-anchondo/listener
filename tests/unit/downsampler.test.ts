import { describe, expect, it } from "vitest";
import { Downsampler, rms, toInt16 } from "@/lib/audio/downsampler";

function sine(rate: number, seconds: number, hz = 440): Float32Array {
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));
}

describe("Downsampler", () => {
  it("produces the right number of samples for 48k to 16k", () => {
    const out = new Downsampler(48000, 16000).process(sine(48000, 1));
    expect(out.length).toBe(16000);
  });

  it("does not drift across 128 sample frames at 44.1k", () => {
    const d = new Downsampler(44100, 16000);
    const input = sine(44100, 2);
    let total = 0;
    for (let i = 0; i < input.length; i += 128) total += d.process(input.subarray(i, i + 128)).length;
    expect(Math.abs(total - 32000)).toBeLessThanOrEqual(1);
  });

  it("matches one shot output when fed in chunks", () => {
    const input = sine(48000, 0.5);
    const whole = new Downsampler(48000, 16000).process(input);
    const d = new Downsampler(48000, 16000);
    const parts: number[] = [];
    for (let i = 0; i < input.length; i += 128) parts.push(...d.process(input.subarray(i, i + 128)));
    expect(Int16Array.from(parts)).toEqual(whole);
  });

  it("passes through at equal rates", () => {
    const out = new Downsampler(16000, 16000).process(Float32Array.from([0, 0.5, -0.5]));
    expect(Array.from(out)).toEqual([0, toInt16(0.5), toInt16(-0.5)]);
  });

  it("refuses to upsample", () => {
    expect(() => new Downsampler(8000, 16000)).toThrow();
  });
});

describe("toInt16 and rms", () => {
  it("clamps to the 16 bit range", () => {
    expect(toInt16(2)).toBe(32767);
    expect(toInt16(-2)).toBe(-32768);
    expect(toInt16(0)).toBe(0);
  });

  it("computes level", () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(Float32Array.from([0.5, -0.5]))).toBeCloseTo(0.5);
  });
});
