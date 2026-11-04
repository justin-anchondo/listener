import { describe, expect, it } from "vitest";
import { parseTheme } from "@/lib/theme";

describe("parseTheme", () => {
  it("defaults to light for anything but dark", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme(undefined)).toBe("light");
    expect(parseTheme("<script>")).toBe("light");
  });
});
