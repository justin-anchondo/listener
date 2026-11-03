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
    <div className="keys">
      <p className="muted">
        Fresh random values, made on this device. Save LISTENER_MASTER_KEY in your password manager: if it&apos;s lost,
        stored data can&apos;t be decrypted.
      </p>
      {Object.entries(values).map(([name, value]) => (
        <div key={name} className="key">
          <span>{name}</span>
          <code>{value}</code>
          <button className="small" onClick={() => copy(name, value)}>{copied === name ? "Copied" : "Copy"}</button>
        </div>
      ))}
    </div>
  );
}
