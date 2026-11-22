// The pages' ports in this browser, built once per person and shared by the live editor and the version view.
import type { PageViewPorts } from "@manent/editor";

/** The pages' ports in this browser, whose engine `userAgent` names; the fonts are read when the editor first draws a page. */
export function browserPagePorts(userAgent: string): PageViewPorts {
  return {
    get fonts() {
      return document.fonts;
    },
    makeFace: (d) =>
      new FontFace(d.family, `url(${d.source}) format("woff2")`, {
        weight: d.weight,
        style: d.style,
        unicodeRange: d.unicodeRange,
        display: d.display,
      }),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    defer: (run) => queueMicrotask(run),
    // a timer where the browser has no idle callback; only a page asks, so the editor has loaded by then
    whenIdle: (run) => {
      if ("requestIdleCallback" in window) requestIdleCallback(() => run());
      else
        void import("@manent/editor").then(({ DRIFT }) =>
          setTimeout(run, DRIFT.idleMs),
        );
    },
    userAgent,
  };
}
