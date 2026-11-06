"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

const SCAN_EVERY_MS = 150;

/**
 * In-app QR scanner. Camera frames are read on this device only, never
 * stored or sent anywhere; the camera stops as soon as a code is read or
 * the scanner closes.
 */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const v = video.current;
      if (done || !v || !ctx || v.readyState < 2 || now - last < SCAN_EVERY_MS) return;
      last = now;
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      ctx.drawImage(v, 0, 0);
      const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
      if (found?.data) {
        done = true;
        stream?.getTracks().forEach((t) => t.stop());
        onResult(found.data);
      }
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (done) return s.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setProblem("Camera access was blocked. Allow it for this site in Settings, or type the code instead."));
    if (!navigator.mediaDevices) setProblem("This browser can't use the camera here. Type the code instead.");

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
        <video ref={video} playsInline muted className="size-full object-cover" aria-label="Camera view for scanning the computer's QR code" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" />
      </div>
      {problem ? <p role="alert" className="text-[14px] text-destructive">{problem}</p> : <p className="text-center text-[14px] text-muted-foreground">Point at the QR code on the computer screen.</p>}
      <button type="button" onClick={onClose} className="min-h-10 text-[14px] text-muted-foreground">Type the code instead</button>
    </div>
  );
}
