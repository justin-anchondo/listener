"use client";

// Siri Orb from 21st.dev (educalvolpz/siri-orb). Pure CSS: conic gradients
// rotated by a registered --angle property, no canvas or WebGL, so it is
// light on battery. Adapted: shared cn, named export, tighter style scope,
// and a clip plus feathered mask so Safari keeps it round.

import type * as React from "react";
import { cn } from "@/lib/utils";

const SIZE_THRESHOLD_SMALL = 50;
const SIZE_THRESHOLD_TINY = 30;
const SIZE_THRESHOLD_MEDIUM = 100;

export interface SiriOrbProps {
  animationDuration?: number;
  className?: string;
  colors?: { bg?: string; c1?: string; c2?: string; c3?: string };
  size?: string;
}

export function SiriOrb({ size = "192px", className, colors, animationDuration = 20 }: SiriOrbProps) {
  const finalColors = {
    bg: "oklch(95% 0.02 264.695)",
    c1: "oklch(75% 0.15 350)",
    c2: "oklch(80% 0.12 200)",
    c3: "oklch(78% 0.14 280)",
    ...colors,
  };
  const s = Number.parseInt(size.replace("px", ""), 10);
  const small = s < SIZE_THRESHOLD_SMALL;
  const blurAmount = small ? Math.max(s * 0.008, 1) : Math.max(s * 0.015, 4);
  const contrastAmount = small ? Math.max(s * 0.004, 1.2) : Math.max(s * 0.008, 1.5);
  const dotSize = small ? Math.max(s * 0.004, 0.05) : Math.max(s * 0.008, 0.1);
  const shadowSpread = small ? Math.max(s * 0.004, 0.5) : Math.max(s * 0.008, 2);
  const maskRadius = s < SIZE_THRESHOLD_TINY ? "0%" : s < SIZE_THRESHOLD_SMALL ? "5%" : s < SIZE_THRESHOLD_MEDIUM ? "15%" : "25%";
  const finalContrast = s < SIZE_THRESHOLD_TINY ? 1.1 : small ? Math.max(contrastAmount * 1.2, 1.3) : contrastAmount;

  return (
    <div
      aria-hidden="true"
      className={cn("siri-orb", className)}
      style={
        {
          width: size,
          height: size,
          "--bg": finalColors.bg,
          "--c1": finalColors.c1,
          "--c2": finalColors.c2,
          "--c3": finalColors.c3,
          "--animation-duration": `${animationDuration}s`,
          "--blur-amount": `${blurAmount}px`,
          "--contrast-amount": finalContrast,
          "--dot-size": `${dotSize}px`,
          "--shadow-spread": `${shadowSpread}px`,
          "--mask-radius": maskRadius,
        } as React.CSSProperties
      }
    >
      <style>{`
        @property --angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        .siri-orb {
          display: grid; grid-template-areas: "stack"; overflow: hidden; border-radius: 50%; position: relative;
          /* Safari ignores border-radius clipping when children use filters; clip-path and a mask always hold.
             The mask also feathers the edge so the orb fades into the page instead of ending on a hard line. */
          clip-path: circle(50% at 50% 50%);
          -webkit-mask-image: radial-gradient(closest-side, #000 88%, transparent 100%);
          mask-image: radial-gradient(closest-side, #000 88%, transparent 100%);
          transform: translateZ(0);
          isolation: isolate;
        }
        .siri-orb::before, .siri-orb::after { content: ""; display: block; grid-area: stack; width: 100%; height: 100%; border-radius: 50%; }
        .siri-orb::before {
          background:
            conic-gradient(from calc(var(--angle) * 2) at 25% 70%, var(--c3), transparent 20% 80%, var(--c3)),
            conic-gradient(from calc(var(--angle) * 2) at 45% 75%, var(--c2), transparent 30% 60%, var(--c2)),
            conic-gradient(from calc(var(--angle) * -3) at 80% 20%, var(--c1), transparent 40% 60%, var(--c1)),
            conic-gradient(from calc(var(--angle) * 2) at 15% 5%, var(--c2), transparent 10% 90%, var(--c2)),
            conic-gradient(from calc(var(--angle) * 1) at 20% 80%, var(--c1), transparent 10% 90%, var(--c1)),
            conic-gradient(from calc(var(--angle) * -2) at 85% 10%, var(--c3), transparent 20% 80%, var(--c3));
          box-shadow: inset var(--bg) 0 0 var(--shadow-spread) calc(var(--shadow-spread) * 0.2);
          filter: blur(var(--blur-amount)) contrast(var(--contrast-amount));
          animation: siri-orb-rotate var(--animation-duration) linear infinite;
        }
        .siri-orb::after {
          background-image: radial-gradient(circle at center, var(--bg) var(--dot-size), transparent var(--dot-size));
          background-size: calc(var(--dot-size) * 2) calc(var(--dot-size) * 2);
          backdrop-filter: blur(calc(var(--blur-amount) * 2)) contrast(calc(var(--contrast-amount) * 2));
          mix-blend-mode: overlay;
          mask-image: radial-gradient(black var(--mask-radius), transparent 75%);
        }
        @keyframes siri-orb-rotate { to { --angle: 360deg; } }
        @media (prefers-reduced-motion: reduce) { .siri-orb::before { animation: none; } }
      `}</style>
    </div>
  );
}
