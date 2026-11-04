"use client";

/**
 * From 21st.dev: "Drawer" by wensity, a bottom sheet built on Base UI's Drawer.
 * Swipe dismiss, snap points, portal, focus trap, and scroll lock from Base UI.
 * Changes: the close icon comes from lucide-react (already used here) instead of
 * @tabler/icons-react, cn comes from @/lib/utils, and the bottom sheet sits flush
 * with the bottom edge on phones with room for the home indicator.
 */

import * as React from "react";
import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DrawerSide = "bottom" | "top" | "left" | "right" | "fullscreen";

const elevatedSurfaceClass = cn(
  "border border-[var(--border)] bg-[color:var(--primitive-surface-elevated,var(--card))]",
  "[box-shadow:var(--primitive-shadow-modal,0_1px_2px_rgba(0,0,0,0.1),0_24px_64px_-28px_rgba(0,0,0,0.5))]",
  "isolate overflow-hidden",
);

const backdropClass = cn(
  "fixed inset-0 z-[var(--primitive-z-overlay,100)] bg-[color:var(--primitive-backdrop,rgba(0,0,0,0.5))]",
  "transition-opacity duration-[300ms] ease-[var(--primitive-ease,cubic-bezier(0.23,1,0.32,1))]",
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
  "motion-reduce:transition-none",
);

const drawerMotionBase = cn(
  "transition-[opacity,translate,scale] duration-[500ms] ease-[var(--primitive-ease,cubic-bezier(0.23,1,0.32,1))]",
  "data-[ending-style]:duration-[250ms]",
  "motion-reduce:transition-none",
);

const sideSwipeDirection: Record<DrawerSide, "up" | "down" | "left" | "right"> = {
  bottom: "down",
  top: "up",
  left: "left",
  right: "right",
  fullscreen: "down",
};

const sideLayout: Record<DrawerSide, string> = {
  bottom: cn(
    "fixed bottom-0 left-1/2 z-[var(--primitive-z-overlay,100)]",
    "w-full max-w-[32rem] -translate-x-1/2",
    "rounded-t-[1.25rem] border-b-0 pb-[env(safe-area-inset-bottom)]",
    "max-h-[85dvh]",
  ),
  top: cn(
    "fixed left-1/2 top-4 z-[var(--primitive-z-overlay,100)]",
    "w-[min(calc(100vw-2rem),26rem)] max-w-full -translate-x-1/2",
    "rounded-[var(--primitive-radius-surface,1rem)]",
    "max-h-[min(72vh,26rem)]",
  ),
  left: cn(
    "fixed inset-y-0 left-0 z-[var(--primitive-z-overlay,100)]",
    "flex h-full w-[min(100vw,22rem)] flex-col rounded-none border-l-0",
  ),
  right: cn(
    "fixed inset-y-0 right-0 z-[var(--primitive-z-overlay,100)]",
    "flex h-full w-[min(100vw,22rem)] flex-col rounded-none border-r-0",
  ),
  fullscreen: cn(
    "fixed inset-3 z-[var(--primitive-z-overlay,100)] flex flex-col",
    "rounded-[var(--primitive-radius-surface,1rem)] sm:inset-4 md:inset-6",
  ),
};

const sideMotion: Record<DrawerSide, string> = {
  bottom: cn(
    drawerMotionBase,
    "translate-y-[calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px))]",
    "data-[starting-style]:translate-y-[105%] data-[ending-style]:translate-y-[105%]",
    "motion-reduce:data-[starting-style]:translate-y-0 motion-reduce:data-[ending-style]:translate-y-0",
  ),
  top: cn(
    drawerMotionBase,
    "translate-y-[calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px))]",
    "data-[starting-style]:-translate-y-[105%] data-[ending-style]:-translate-y-[105%]",
    "motion-reduce:data-[starting-style]:translate-y-0 motion-reduce:data-[ending-style]:translate-y-0",
  ),
  left: cn(
    drawerMotionBase,
    "translate-x-[var(--drawer-swipe-movement-x,0px)]",
    "data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
    "motion-reduce:data-[starting-style]:translate-x-0 motion-reduce:data-[ending-style]:translate-x-0",
  ),
  right: cn(
    drawerMotionBase,
    "translate-x-[var(--drawer-swipe-movement-x,0px)]",
    "data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
    "motion-reduce:data-[starting-style]:translate-x-0 motion-reduce:data-[ending-style]:translate-x-0",
  ),
  fullscreen: cn(
    drawerMotionBase,
    "translate-y-[var(--drawer-swipe-movement-y,0px)]",
    "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
    "data-[starting-style]:scale-[0.985] data-[ending-style]:scale-[0.985]",
    "motion-reduce:data-[starting-style]:scale-100 motion-reduce:data-[ending-style]:scale-100",
  ),
};

function adaptOpenChange(onOpenChange?: (open: boolean) => void): ((open: boolean, details: unknown) => void) | undefined {
  if (!onOpenChange) return undefined;
  return (open) => onOpenChange(open);
}

type DrawerContextValue = { side: DrawerSide };

const DrawerContext = React.createContext<DrawerContextValue>({ side: "bottom" });

export interface DrawerProps
  extends Omit<React.ComponentPropsWithoutRef<typeof BaseDrawer.Root>, "onOpenChange" | "swipeDirection" | "children"> {
  side?: DrawerSide;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Drawer({ side = "bottom", onOpenChange, snapPoints, modal = true, children, ...props }: DrawerProps) {
  return (
    <DrawerContext.Provider value={{ side }}>
      <BaseDrawer.Root
        modal={modal}
        swipeDirection={sideSwipeDirection[side]}
        snapPoints={side === "bottom" || side === "top" ? snapPoints : undefined}
        onOpenChange={adaptOpenChange(onOpenChange)}
        {...props}
      >
        {children}
      </BaseDrawer.Root>
    </DrawerContext.Provider>
  );
}

export interface DrawerTriggerProps extends React.ComponentPropsWithoutRef<typeof BaseDrawer.Trigger> {
  asChild?: boolean;
}

export function DrawerTrigger({ asChild = false, children, ...props }: DrawerTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    const nativeButton = typeof children.type === "string" ? children.type === "button" : true;
    return <BaseDrawer.Trigger nativeButton={nativeButton} render={children as React.ReactElement} {...props} />;
  }
  return <BaseDrawer.Trigger {...props}>{children}</BaseDrawer.Trigger>;
}

export interface DrawerCloseProps extends React.ComponentPropsWithoutRef<typeof BaseDrawer.Close> {
  asChild?: boolean;
}

export function DrawerClose({ asChild = false, children, ...props }: DrawerCloseProps) {
  if (asChild && React.isValidElement(children)) {
    const nativeButton = typeof children.type === "string" ? children.type === "button" : true;
    return <BaseDrawer.Close nativeButton={nativeButton} render={children as React.ReactElement} {...props} />;
  }
  return <BaseDrawer.Close {...props}>{children}</BaseDrawer.Close>;
}

const drawerScrollBodyClass = cn(
  "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y",
  "[&_input]:select-text [&_textarea]:select-text [&_[contenteditable=true]]:select-text",
);

export function DrawerScrollBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-drawer-scroll-body="" className={cn(drawerScrollBodyClass, className)} {...props} />;
}

export interface DrawerContentProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  container?: React.ComponentPropsWithoutRef<typeof BaseDrawer.Portal>["container"];
  showHandle?: boolean;
  showClose?: boolean;
}

export function DrawerContent({
  children,
  className,
  title,
  description,
  container,
  showHandle = true,
  showClose = true,
}: DrawerContentProps) {
  const { side } = React.useContext(DrawerContext);
  const isFullscreen = side === "fullscreen";
  const isBottom = side === "bottom";
  const isTop = side === "top";
  const showGrabHandle = showHandle && (isBottom || isTop);

  return (
    <BaseDrawer.Portal container={container}>
      <BaseDrawer.Backdrop className={backdropClass} />
      <BaseDrawer.Viewport className="fixed inset-0 z-[var(--primitive-z-overlay,100)] outline-none">
        <BaseDrawer.Popup
          data-wensity-primitive=""
          className={cn(sideLayout[side], elevatedSurfaceClass, sideMotion[side], "flex flex-col outline-none", className)}
        >
          <BaseDrawer.Content className="relative flex min-h-0 flex-1 flex-col">
            <BaseDrawer.Title className="sr-only">{typeof title === "string" ? title : "Drawer"}</BaseDrawer.Title>
            {description ? (
              <BaseDrawer.Description className="sr-only">
                {typeof description === "string" ? description : "Drawer panel"}
              </BaseDrawer.Description>
            ) : null}

            {isBottom && showGrabHandle ? (
              <div className="flex shrink-0 flex-col items-center px-4 pb-2 pt-3">
                <span className="h-1.5 w-10 rounded-full bg-[var(--muted-foreground)]/35" />
              </div>
            ) : null}

            {(title || description) && (
              <div
                className={cn(
                  "shrink-0 border-b border-[var(--border)]",
                  isFullscreen
                    ? "px-5 py-4 pr-14 sm:px-8 sm:py-5"
                    : cn(
                        "px-5 pb-4 pr-12",
                        isBottom && showGrabHandle ? "pt-0" : "pt-4",
                        isTop && "pt-4",
                        (side === "left" || side === "right") && "pt-4",
                      ),
                )}
              >
                {title ? (
                  <p
                    className={cn(
                      "font-semibold tracking-[-0.015em] text-[var(--foreground)]",
                      isFullscreen ? "text-lg sm:text-xl" : "text-base",
                    )}
                  >
                    {title}
                  </p>
                ) : null}
                {description ? (
                  <p className={cn("text-[var(--muted-foreground)]", isFullscreen ? "mt-1.5 text-sm leading-relaxed" : "mt-1 text-[13px]")}>
                    {description}
                  </p>
                ) : null}
              </div>
            )}

            {isFullscreen ? (
              <DrawerScrollBody className="flex min-h-0 flex-1 flex-col">
                <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-6 sm:px-8 sm:py-8">{children}</div>
              </DrawerScrollBody>
            ) : (
              <DrawerScrollBody className="min-h-0 flex-1 px-5 py-4">{children}</DrawerScrollBody>
            )}

            {isTop && showGrabHandle ? (
              <div className="flex shrink-0 justify-center px-4 pb-3 pt-2">
                <span className="h-1.5 w-10 rounded-full bg-[var(--muted-foreground)]/35" />
              </div>
            ) : null}

            {showClose ? (
              <BaseDrawer.Close
                className={cn(
                  "absolute inline-flex size-10 items-center justify-center rounded-[0.625rem]",
                  isFullscreen ? "right-4 top-4 sm:right-5 sm:top-5" : "right-3 top-3",
                  "border border-transparent text-[var(--muted-foreground)]",
                  "transition-[background-color,border-color,color] duration-150",
                  "hover:border-[var(--border)] hover:text-[var(--foreground)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                )}
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={1.75} />
              </BaseDrawer.Close>
            ) : null}
          </BaseDrawer.Content>
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  );
}
