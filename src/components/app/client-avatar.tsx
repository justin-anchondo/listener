import { cn } from "@/lib/utils";

const TINTS = [
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
];

function tint(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Client logo, or coloured initials when there isn't one. */
export function ClientAvatar({
  client,
  size = 32,
  className,
}: {
  client: { id: string; name: string; logoVersion: number | null };
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (client.logoVersion) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/clients/${client.id}/logo?v=${client.logoVersion}`}
        alt=""
        style={style}
        className={cn("shrink-0 rounded-lg border bg-white object-contain p-0.5", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      className={cn("grid shrink-0 place-items-center rounded-lg font-semibold", tint(client.id), className)}
    >
      {initials(client.name)}
    </span>
  );
}
