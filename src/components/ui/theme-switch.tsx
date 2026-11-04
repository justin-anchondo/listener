"use client";

// From 21st.dev: "Sliding Icon Theme Switch" by bundui. Wired to Listener's
// theme: flips the .dark class on <html> and remembers the choice in a cookie.

import { MoonIcon, SunIcon } from "lucide-react";
import { useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useInitialTheme } from "@/components/app/theme";
import { type Theme, themeCookie } from "@/lib/theme";

export function ThemeSwitch() {
  const id = useId();
  const initial = useInitialTheme();
  // checked = light, matching the original component's sun-on-the-right layout
  const [checked, setChecked] = useState<boolean>(initial === "light");

  function change(light: boolean) {
    setChecked(light);
    const theme: Theme = light ? "light" : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.cookie = themeCookie(theme);
  }

  return (
    <div>
      <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
        <Switch
          checked={checked}
          className="peer data-[state=unchecked]:bg-input/50 absolute inset-0 h-[inherit] w-auto [&_span]:z-10 [&_span]:h-full [&_span]:w-1/2 [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-x-full [&_span]:data-[state=checked]:rtl:-translate-x-full"
          id={id}
          onCheckedChange={change}
        />
        <span className="pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] peer-data-[state=checked]:invisible peer-data-[state=unchecked]:translate-x-full peer-data-[state=unchecked]:rtl:-translate-x-full">
          <MoonIcon aria-hidden="true" size={16} />
        </span>
        <span className="peer-data-[state=checked]:text-background pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] peer-data-[state=checked]:-translate-x-full peer-data-[state=unchecked]:invisible peer-data-[state=checked]:rtl:translate-x-full">
          <SunIcon aria-hidden="true" size={16} />
        </span>
      </div>
      <label className="sr-only" htmlFor={id}>
        Light mode
      </label>
    </div>
  );
}
