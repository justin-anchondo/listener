// Which sign in to offer first. A desktop browser goes straight to approving
// from the phone; phones and tablets sign in with their own passkey.

export type BrowserTraits = { userAgent: string; maxTouchPoints: number; finePointer: boolean };

export function isDesktopBrowser(t: BrowserTraits): boolean {
  const ua = t.userAgent;
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return false;
  // iPadOS reports a Mac user agent; it gives itself away with multi-touch.
  if (/Macintosh/.test(ua) && t.maxTouchPoints > 1) return false;
  return t.finePointer;
}
