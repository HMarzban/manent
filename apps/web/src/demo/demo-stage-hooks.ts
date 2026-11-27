// Shared Demo Stage hooks: Tour highlight auto-open target, calm writing focus dimming, and companion window URLs.
import { TOUR } from "@manent/demo";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useTourActive } from "../state/tour.store.ts";

const WRITING_ENTER_MS = 400;
const WRITING_IDLE_MS = 2_400;

/** Active Tour step's `demo:*` highlight target, or null when none. */
export function useActiveDemoTourTarget(): string | null {
  const active = useTourActive();
  if (active === null) return null;
  const scenario = TOUR.scenarios.find((s) => s.id === active.scenarioId);
  const target = scenario?.steps[active.step]?.highlight ?? null;
  return target !== null && target.startsWith("demo:") ? target : null;
}

/** Gently dims the demo bar while actively typing inside the script editor (never on keystroke render path). */
export function useWritingFocusAttr(
  barRef: RefObject<HTMLElement | null> | undefined,
  disabled: boolean,
): void {
  useEffect(() => {
    const el = barRef?.current ?? null;
    if (el === null) return undefined;
    if (disabled) {
      el.removeAttribute("data-writing");
      return undefined;
    }
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let active = false;

    const clear = (): void => {
      if (startTimer !== null) clearTimeout(startTimer);
      if (idleTimer !== null) clearTimeout(idleTimer);
      startTimer = null;
      idleTimer = null;
      if (active) {
        active = false;
        el.removeAttribute("data-writing");
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const { target } = event;
      if (!(target instanceof Element) || !target.closest("[data-editor-host]"))
        return;
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(clear, WRITING_IDLE_MS);
      if (!active && startTimer === null) {
        startTimer = setTimeout(() => {
          startTimer = null;
          active = true;
          el.setAttribute("data-writing", "true");
        }, WRITING_ENTER_MS);
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      clear();
    };
  }, [barRef, disabled]);
}

/** Keeps the demo bar's edge state and collapsed class synchronised without re-rendering the outer shell. */
export function useBarSurfaceSync(
  barRef: RefObject<HTMLElement | null> | undefined,
  state: "danger" | "attention" | null,
  collapsed: boolean,
): void {
  useEffect(() => {
    const el = barRef?.current;
    if (!el) return;
    if (state !== null) el.setAttribute("data-demo-state", state);
    else el.removeAttribute("data-demo-state");
  }, [barRef, state]);

  useEffect(() => {
    const el = barRef?.current;
    if (!el) return;
    if (collapsed) {
      el.classList.remove("h-demobar", "min-h-demobar", "overflow-x-clip");
      el.classList.add("mn-demo-collapsed");
    } else {
      el.classList.add("h-demobar", "min-h-demobar", "overflow-x-clip");
      el.classList.remove("mn-demo-collapsed");
    }
  }, [barRef, collapsed]);
}

/** Auto-expands the bar and opens the owning popover (forcing Demo controls tab) when a Tour step targets `demo:*`. */
export function useTourPopoverSync(options: {
  readonly activeDemoTarget: string | null;
  readonly collapsed: boolean;
  readonly serverStopped: boolean;
  readonly onExpand: () => void;
  readonly onOpenLive: () => void;
  readonly onOpenLabControls: () => void;
  readonly onClose: () => void;
}): void {
  const {
    activeDemoTarget,
    collapsed,
    serverStopped,
    onExpand,
    onOpenLive,
    onOpenLabControls,
    onClose,
  } = options;
  const prevTarget = useRef<string | null>(null);
  useEffect(() => {
    if (prevTarget.current === activeDemoTarget) return;
    prevTarget.current = activeDemoTarget;
    if (activeDemoTarget === null) {
      onClose();
      return;
    }
    if (collapsed) onExpand();
    if (activeDemoTarget === "demo:connection") onOpenLive();
    else if (
      activeDemoTarget === "demo:writers" ||
      activeDemoTarget === "demo:reset" ||
      (activeDemoTarget === "demo:server" && !serverStopped)
    ) {
      onOpenLabControls();
    }
  }, [
    activeDemoTarget,
    collapsed,
    serverStopped,
    onExpand,
    onOpenLive,
    onOpenLabControls,
    onClose,
  ]);
}

/** Builds a path URL for switching person in place or opening a second companion window. */
export function companionUrlFor(
  userId: string,
  panelsClosed: boolean,
  targetPath?: string | null,
): string {
  const loc = window.location;
  const fallback = loc.pathname === "/choose" ? "/" : loc.pathname;
  const path = targetPath ?? fallback;
  const base =
    loc.origin && loc.origin !== "null" ? loc.origin : "http://manent.invalid";
  const url = new URL(path, base);
  url.searchParams.set("person", userId);
  if (panelsClosed) url.searchParams.set("panels", "closed");
  return `${url.pathname}${url.search}`;
}
