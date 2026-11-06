"use client";

import { useEffect, useState } from "react";

/** Large screen layout (matches Tailwind's lg breakpoint). False during server render. */
export function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return wide;
}
