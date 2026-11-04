"use client";

import { createContext, useContext } from "react";
import type { Theme } from "@/lib/theme";

const ThemeContext = createContext<Theme>("light");

/** Carries the theme the server rendered with, so toggles start in the right position. */
export function ThemeProvider({ initial, children }: { initial: Theme; children: React.ReactNode }) {
  return <ThemeContext.Provider value={initial}>{children}</ThemeContext.Provider>;
}

export function useInitialTheme(): Theme {
  return useContext(ThemeContext);
}
