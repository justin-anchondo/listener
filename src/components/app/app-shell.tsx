import { Sidebar } from "@/components/app/sidebar";
import { TabBar } from "@/components/app/tab-bar";
import { cn } from "@/lib/utils";

/**
 * Signed in screens. Phones: content above a fixed bottom tab bar. Large
 * screens: a sidebar on the left and a wider content column; `wide` lets a
 * screen (the live view) use the full width.
 */
export function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <Sidebar />
      <div className="lg:pl-64">
        <div
          className={cn(
            "mx-auto flex min-h-dvh max-w-xl flex-col pb-[calc(env(safe-area-inset-bottom)+76px)] lg:pb-8",
            wide ? "lg:max-w-none lg:pb-0" : "lg:max-w-5xl lg:px-6 lg:pt-4",
          )}
        >
          {children}
        </div>
      </div>
      <div className="lg:hidden">
        <TabBar />
      </div>
    </>
  );
}
