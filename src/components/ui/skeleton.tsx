import { cn } from "@/lib/utils";

/** Gray placeholder blocks shown while a list loads for the first time. */
export function SkeletonRows({ count = 4, avatar = true, className }: { count?: number; avatar?: boolean; className?: string }) {
  return (
    <ul aria-busy="true" aria-label="Loading" className={cn("flex flex-col", className)}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-muted py-3.5 last:border-b-0">
          {avatar && <span className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />}
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
            <span className="h-3 w-2/5 animate-pulse rounded bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-lg bg-muted", className)} />;
}
