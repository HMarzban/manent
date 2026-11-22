// The window's regions in their grid areas, and how focus moves between them and is read.
import type { CommandContext } from "@manent/commands";
import { REGIONS, createFocusOrigin, nextRegion } from "@manent/ui";
import type { CSSProperties, ReactNode } from "react";
import { focusHeading } from "../focus.ts";
import { shellAnnouncer } from "./announcer-region.tsx";

type RegionName = (typeof REGIONS)[number];

/** The shell's grid area each region is drawn in. */
const AREAS: Readonly<Record<RegionName, string>> = Object.freeze({
  demo_bar: "demobar",
  title_bar: "titlebar",
  state_bar: "statebar",
  left_panel: "left",
  page: "page",
  side_panel: "side",
  status_bar: "statusbar",
});

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(", ");
const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";
const DIALOG_SELECTOR = "[role='dialog'], [role='alertdialog']";

/** One region of the window, drawn in its own grid area of the shell. */
export function ShellRegion(props: {
  region: RegionName;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}): ReactNode {
  const { region, className, style, children } = props;
  return (
    <div
      data-region={region}
      className={className}
      style={{ gridArea: AREAS[region], ...style }}
    >
      {children}
    </div>
  );
}

/** What the shell does with focus, and its announcer; the handlers reach the window through it. */
export interface ShellDom {
  /** The kind of control that holds focus now. */
  focusKind(): CommandContext["focus"];
  pageFocused(): boolean;
  /** Focus goes to the page's mount point; false while a screen covers the page. */
  focusPage(): boolean;
  /** Focus goes to the next region that is drawn (1) or the previous one (-1), wrapping round. */
  focusNextRegion(direction: 1 | -1): void;
  /** Focus goes to the first control of the side panel's tab, or of the part of it `within` selects. */
  focusSidePanel(within?: string): void;
  /** Keeps the element that holds focus, for `restoreFocus`. */
  rememberFocus(): void;
  /** Focus goes back to the element kept last, else to the page, else to the screen's heading; never to the body. */
  restoreFocus(): void;
  announce(text: string): void;
}

/** The regions after `current` in F6 order (1) or before it (-1), each once; all of them, from the end, when focus is in none. */
function regionsFrom(
  current: RegionName | null,
  direction: 1 | -1,
): RegionName[] {
  if (current === null)
    return direction === 1 ? [...REGIONS] : REGIONS.toReversed();
  const order: RegionName[] = [];
  let region = current;
  for (let step = 1; step < REGIONS.length; step++) {
    region = nextRegion(region, direction);
    order.push(region);
  }
  return order;
}

const regionOf = (element: Element | null): RegionName | null => {
  const name = element?.closest("[data-region]")?.getAttribute("data-region");
  return REGIONS.find((region) => region === name) ?? null;
};

/** Focuses `element` itself, outside the Tab order unless it has a tab index of its own; false when it cannot take focus. */
function holdFocus(element: Element): boolean {
  if (!(element instanceof HTMLElement) || element.closest("[inert]") !== null)
    return false;
  if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
  element.focus({ preventScroll: true });
  return element.ownerDocument.activeElement === element;
}

/** Focuses the first control inside `element`, or `element` itself when it holds none; false when neither can take focus. */
function focusInside(element: Element): boolean {
  const control = element.querySelector(FOCUSABLE_SELECTOR);
  if (control === null) return holdFocus(element);
  if (!(control instanceof HTMLElement) || element.closest("[inert]") !== null)
    return false;
  control.focus({ preventScroll: true });
  return element.ownerDocument.activeElement === control;
}

export function createShellDom(doc: Document): ShellDom {
  const origin = createFocusOrigin();
  const regionElement = (region: RegionName): Element | null =>
    doc.querySelector(`[data-region="${region}"]`);
  const pageFocused = (): boolean => regionOf(doc.activeElement) === "page";
  // a screen over the page makes the editor host inert
  const focusPage = (): boolean => {
    const page = regionElement("page");
    return (
      page !== null &&
      page.querySelector("[inert]") === null &&
      focusInside(page)
    );
  };

  return {
    focusKind() {
      const active = doc.activeElement;
      if (active === null || active === doc.body) return "other";
      if (active.closest(DIALOG_SELECTOR) !== null) return "dialog";
      const region = regionOf(active);
      if (region === "page") return "page";
      if (active.matches(FIELD_SELECTOR)) return "field";
      if (region === "left_panel" || region === "side_panel") return "panel";
      return "other";
    },
    pageFocused,
    focusPage,
    focusNextRegion(direction) {
      regionsFrom(regionOf(doc.activeElement), direction).some((region) => {
        const element = regionElement(region);
        return element !== null && focusInside(element);
      });
    },
    focusSidePanel(within) {
      const panel = regionElement("side_panel");
      if (panel === null) return;
      const tab = panel.querySelector("[role='tabpanel']") ?? panel;
      // the part, once it holds a control
      const drawnPart = (): Element | null => {
        const part = within === undefined ? tab : tab.querySelector(within);
        return part !== null && part.querySelector(FOCUSABLE_SELECTOR) !== null
          ? part
          : null;
      };
      const part = drawnPart();
      if (part !== null) {
        focusInside(part);
        return;
      }
      // a part whose controls load apart is drawn later: the tab holds focus until its first control takes it,
      // unless focus has moved on by then
      holdFocus(tab);
      const drawn = new MutationObserver(() => {
        const found = drawnPart();
        if (doc.activeElement !== tab) drawn.disconnect();
        else if (found !== null) {
          drawn.disconnect();
          focusInside(found);
        }
      });
      drawn.observe(tab, { childList: true, subtree: true });
    },
    rememberFocus() {
      origin.push(doc.activeElement);
    },
    restoreFocus() {
      origin.restore(() => {
        if (!focusPage()) focusHeading(doc);
      });
    },
    announce(text) {
      shellAnnouncer(doc).announce(text);
    },
  };
}
