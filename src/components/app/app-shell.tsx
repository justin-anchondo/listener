import { TabBar } from "@/components/app/tab-bar";

/** Signed in screens: content above a fixed bottom tab bar. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col pb-[calc(env(safe-area-inset-bottom)+76px)]">
      {children}
      <TabBar />
    </div>
  );
}
