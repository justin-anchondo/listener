"use client";

import { useState } from "react";

// Generates secrets in this browser with the platform's secure random source.
// Nothing is sent to the server or stored.

function randomBase64(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

function randomPassword(): string {
  return randomBase64(24).replace(/[+/=]/g, "").slice(0, 32);
}

export default function KeyGenerator() {
  const [values] = useState(() => ({
    LISTENER_MASTER_KEY: randomBase64(32),
    CRON_SECRET: randomPassword(),
    "listener_app password": randomPassword(),
  }));
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(name: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <p className="text-[14px] text-muted-foreground">
        Fresh random values, made on this device. Save LISTENER_MASTER_KEY in your password manager: if it&apos;s lost,
        stored data can&apos;t be decrypted.
      </p>
      {Object.entries(values).map(([name, value]) => (
        <div key={name} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <span className="text-[13px] text-muted-foreground">{name}</span>
          <code className="break-all text-[13px]">{value}</code>
          <button type="button" onClick={() => copy(name, value)} className="min-h-10 self-start rounded-lg border px-3 text-[14px]">
            {copied === name ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
    </div>
  );
}
