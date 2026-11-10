import type * as React from "react";
import { cn } from "@/lib/utils";

// Text Shimmer from 21st.dev Agent Elements (serafimcloud/text-shimmer),
// adapted to the app's colors: a highlight sweeps across muted text.
// Plain CSS background animation, which Safari runs smoothly.

export function TextShimmer({ children, as: Component = "span", className, duration = 1.8 }: {
  children: React.ReactNode;
  as?: React.ElementType;
  className?: string;
  duration?: number;
}) {
  return (
    <Component
      className={cn(
        "inline-block bg-clip-text text-transparent [background-repeat:no-repeat] [background-size:250%_100%]",
        "bg-[linear-gradient(90deg,var(--muted-foreground)_0%,var(--muted-foreground)_40%,var(--foreground)_50%,var(--muted-foreground)_60%,var(--muted-foreground)_100%)]",
        "motion-safe:animate-[text-shimmer_var(--shimmer-duration)_linear_infinite]",
        className,
      )}
      style={{ "--shimmer-duration": `${duration}s` } as React.CSSProperties}
    >
      {children}
    </Component>
  );
}
