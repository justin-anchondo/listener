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

/** What the computer's own sign in is called, for buttons ("Sign in with Windows Hello"). */
export function computerSignInName(userAgent: string): string {
  if (/Windows/.test(userAgent)) return "Windows Hello";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "Touch ID";
  return "this computer's passkey";
}

const COMPUTER_PASSKEY_KEY = "listener.computerPasskey"; // per browser hint: this computer has its own passkey

export function hasComputerPasskey(): boolean {
  try {
    return localStorage.getItem(COMPUTER_PASSKEY_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberComputerPasskey(state: "1" | "dismissed"): void {
  try {
    localStorage.setItem(COMPUTER_PASSKEY_KEY, state);
  } catch {
    // storage unavailable; the offer just shows again next time
  }
}

export function computerPasskeyOfferDismissed(): boolean {
  try {
    return localStorage.getItem(COMPUTER_PASSKEY_KEY) !== null;
  } catch {
    return true;
  }
}
