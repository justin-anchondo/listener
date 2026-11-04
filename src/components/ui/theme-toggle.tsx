"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useInitialTheme } from "@/components/app/theme";
import { type Theme, themeCookie } from "@/lib/theme";

/** Small sun/moon button. Flips the .dark class and remembers the choice in a cookie. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(useInitialTheme());
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        document.documentElement.classList.toggle("dark", next === "dark");
        document.cookie = themeCookie(next);
      }}
      aria-label={`Switch to ${next} mode`}
      className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
    >
      {theme === "dark" ? <Sun className="size-[18px]" aria-hidden="true" /> : <Moon className="size-[18px]" aria-hidden="true" />}
    </button>
  );
}
