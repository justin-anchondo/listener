import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** Top of every signed in screen: optional back link, title, and actions. */
export function PageHeader({
  title,
  back,
  meta,
  actions,
}: {
  title?: React.ReactNode;
  back?: { href: string; label: string };
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2 px-5 pt-safe">
      <div className="flex min-h-11 items-center justify-between gap-3">
        {back ? (
          <Link href={back.href} className="-ml-1.5 flex min-h-11 min-w-0 items-center gap-0.5 text-[15px] text-muted-foreground">
            <ChevronLeft className="size-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{back.label}</span>
          </Link>
        ) : (
          <span className="text-[17px] font-bold tracking-tight">Listener</span>
        )}
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {title ? <h1 className="text-[26px] font-bold leading-tight tracking-tight">{title}</h1> : null}
      {meta ? <p className="text-[13px] text-muted-foreground">{meta}</p> : null}
    </header>
  );
}
