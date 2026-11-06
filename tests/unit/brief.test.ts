import { describe, expect, it } from "vitest";
import { parseConfig } from "@/lib/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { briefFileProblem, normalizeBriefText } from "@/lib/brief";
import { cleanText } from "@/lib/policy/limits";

describe("brief files", () => {
  it("accepts Markdown and text files within the limit", () => {
    expect(briefFileProblem({ name: "Brief.md", size: 12_000 }, 40_000)).toBeNull();
    expect(briefFileProblem({ name: "notes.MARKDOWN", size: 10 }, 40_000)).toBeNull();
    expect(briefFileProblem({ name: "notes.txt", size: 10 }, 40_000)).toBeNull();
  });
  it("refuses other types, empty files, and files too large", () => {
    expect(briefFileProblem({ name: "brief.docx", size: 10 }, 40_000)).toMatch(/\.md/);
    expect(briefFileProblem({ name: "brief.md", size: 0 }, 40_000)).toMatch(/empty/);
    expect(briefFileProblem({ name: "brief.md", size: 160_001 }, 40_000)).toMatch(/too large/);
  });
  it("normalizes line endings and a byte order mark", () => {
    expect(normalizeBriefText("﻿# Goals\r\n- Ship\r\n")).toBe("# Goals\n- Ship\n");
  });
});

describe("brief length", () => {
  it("saves a long brief up to the configured limit", () => {
    const config = parseConfig(readFileSync(path.join(__dirname, "../../config.yaml"), "utf8"));
    expect(config.storage.max_brief_chars).toBeGreaterThanOrEqual(40_000);
    const long = "x".repeat(config.storage.max_brief_chars);
    expect(cleanText(long, config.storage.max_brief_chars, "brief")).toBe(long);
    expect(() => cleanText(`${long}x`, config.storage.max_brief_chars, "brief")).toThrow();
  });
});
