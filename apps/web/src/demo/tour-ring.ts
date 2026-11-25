// Marks the control of an active Tour step with the instant Tour ring and scrolls off-screen targets into view.
import type { TourScenario } from "@manent/demo";
import { useLayoutEffect } from "react";

/** Scrolls `element` into view if laid out and off-screen; returns true when the element has a non-zero layout box. */
function scrollIfOffscreen(element: Element): boolean {
  if (typeof element.getBoundingClientRect !== "function") return false;
  const rect = element.getBoundingClientRect();
  // happy-dom and unlaid-out elements have a 0×0 box: skip them so a visible sibling can still scroll
  if (rect.width === 0 && rect.height === 0) return false;
  const inView =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;
  if (!inView) {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }
  return true;
}

/**
 * Marks the control of step `at` with `[data-tour-ring]` when `enabled` is true, watching arrivals via a scoped
 * MutationObserver and tracking ringed elements so attribute mutations never leave stale rings behind.
 */
export function useTourRing(
  steps: TourScenario["steps"],
  at: number | null,
  enabled = true,
  locateNonce = 0,
): void {
  useLayoutEffect(() => {
    if (!enabled || at === null) return;
    const step = steps[at];
    if (step === undefined) return;
    const selector = `[data-tour="${CSS.escape(step.highlight)}"]`;
    const ringed = new Set<Element>();
    let scrolled = false;

    const mark = (control: Element): void => {
      control.setAttribute("data-tour-ring", "");
      ringed.add(control);
      if (!scrolled) scrolled = scrollIfOffscreen(control);
    };
    const ring = (root: Element | Document): void => {
      if (root instanceof Element) {
        if (root.matches(selector)) mark(root);
        else if (ringed.delete(root)) root.removeAttribute("data-tour-ring");
      }
      for (const control of root.querySelectorAll(selector)) mark(control);
    };

    ring(document);
    const arrivals = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element && record.type === "attributes")
          ring(record.target);
        for (const node of record.addedNodes)
          if (node instanceof Element) ring(node);
      }
    });
    arrivals.observe(document.body, {
      childList: true,
      subtree: true,
      attributeFilter: ["data-tour"],
    });
    return () => {
      arrivals.disconnect();
      for (const control of ringed) control.removeAttribute("data-tour-ring");
      for (const control of document.querySelectorAll(selector))
        control.removeAttribute("data-tour-ring");
    };
  }, [steps, at, enabled, locateNonce]);
}
