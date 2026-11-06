import { describe, expect, it } from "vitest";
import { isDesktopBrowser } from "@/lib/device";

const chromeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const safariMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

describe("isDesktopBrowser", () => {
  it("treats Windows and Mac browsers with a mouse as desktop", () => {
    expect(isDesktopBrowser({ userAgent: chromeWin, maxTouchPoints: 0, finePointer: true })).toBe(true);
    expect(isDesktopBrowser({ userAgent: safariMac, maxTouchPoints: 0, finePointer: true })).toBe(true);
  });
  it("treats phones, Android, and iPads (which claim to be Macs) as mobile", () => {
    expect(isDesktopBrowser({ userAgent: iphone, maxTouchPoints: 5, finePointer: false })).toBe(false);
    expect(isDesktopBrowser({ userAgent: android, maxTouchPoints: 5, finePointer: false })).toBe(false);
    expect(isDesktopBrowser({ userAgent: safariMac, maxTouchPoints: 5, finePointer: true })).toBe(false);
  });
  it("treats a touch-only computer as mobile", () => {
    expect(isDesktopBrowser({ userAgent: chromeWin, maxTouchPoints: 10, finePointer: false })).toBe(false);
  });
});
