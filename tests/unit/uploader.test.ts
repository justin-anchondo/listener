import { describe, expect, it, vi } from "vitest";
import { SegmentUploader } from "@/lib/capture/uploader";

const C = "11111111-1111-4111-8111-111111111111";
const M = "22222222-2222-4222-8222-222222222222";
const seg = (text: string) => ({ speaker: 0, startMs: 0, endMs: 100, text });

function server(statuses: number[]) {
  const calls: { url: string; body: unknown }[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const status = statuses.length ? statuses.shift()! : 200;
    if (status === 0) throw new TypeError("network");
    return new Response("{}", { status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("SegmentUploader", () => {
  it("numbers segments and posts them to the scoped meeting", async () => {
    const s = server([]);
    const u = new SegmentUploader({ clientId: C, meetingId: M, maxPerPost: 10, fetchImpl: s.impl });
    u.add(seg("a"));
    u.add(seg("b"));
    await u.flush();
    expect(s.calls[0].url).toBe(`/api/clients/${C}/meetings/${M}/segments`);
    expect((s.calls[0].body as { segments: { seq: number }[] }).segments.map((x) => x.seq)).toEqual([0, 1]);
    expect(u.state()).toEqual({ pending: 0, saved: 2, failing: false, unauthorized: false });
  });

  it("keeps segments after a failure and resends them", async () => {
    const s = server([0, 500, 200]);
    const u = new SegmentUploader({ clientId: C, meetingId: M, maxPerPost: 10, fetchImpl: s.impl });
    u.add(seg("a"));
    await u.flush();
    expect(u.state().pending).toBe(1);
    expect(u.state().failing).toBe(true);
    await u.flush();
    await u.flush();
    expect(u.state()).toMatchObject({ pending: 0, saved: 1, failing: false });
    expect(s.calls).toHaveLength(3);
  });

  it("flags an expired session", async () => {
    const u = new SegmentUploader({ clientId: C, meetingId: M, maxPerPost: 10, fetchImpl: server([401]).impl });
    u.add(seg("a"));
    await u.flush();
    expect(u.state()).toMatchObject({ unauthorized: true, pending: 1 });
  });

  it("sends in batches no larger than the limit", async () => {
    const s = server([]);
    const u = new SegmentUploader({ clientId: C, meetingId: M, maxPerPost: 2, fetchImpl: s.impl });
    for (const t of ["a", "b", "c"]) u.add(seg(t));
    await u.flush();
    expect(u.state().pending).toBe(1);
    await u.flush();
    expect(s.calls.map((c) => (c.body as { segments: unknown[] }).segments.length)).toEqual([2, 1]);
  });

  it("shares one request between overlapping flushes", async () => {
    const s = server([]);
    const u = new SegmentUploader({ clientId: C, meetingId: M, maxPerPost: 10, fetchImpl: s.impl });
    u.add(seg("a"));
    await Promise.all([u.flush(), u.flush()]);
    expect(s.calls).toHaveLength(1);
  });

  it("drains the queue and then ends the meeting", async () => {
    const s = server([500, 200, 200, 200]);
    const u = new SegmentUploader({ clientId: C, meetingId: M, maxPerPost: 1, fetchImpl: s.impl });
    u.add(seg("a"));
    u.add(seg("b"));
    expect(await u.finish(3, 1)).toBe(true);
    expect(s.calls.at(-1)?.url).toBe(`/api/clients/${C}/meetings/${M}/end`);
    expect(u.state().saved).toBe(2);
  });
});
