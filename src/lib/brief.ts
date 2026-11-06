// Loading a project brief from a Markdown or text file (read on the phone or
// computer; the file itself is never uploaded, only its text is saved).

export const BRIEF_FILE_ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";
const EXTENSIONS = /\.(md|markdown|txt)$/i;
const MAX_BYTES_PER_CHAR = 4; // UTF-8 worst case

/** Returns a message when the file can't be used as a brief, or null when it can. */
export function briefFileProblem(file: { name: string; size: number }, maxChars: number): string | null {
  if (!EXTENSIONS.test(file.name)) return "Use a .md, .markdown, or .txt file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxChars * MAX_BYTES_PER_CHAR) return `That file is too large for a brief (up to ${maxChars.toLocaleString()} characters).`;
  return null;
}

/** Drops a byte order mark and Windows line endings so the text matches what was typed. */
export function normalizeBriefText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
