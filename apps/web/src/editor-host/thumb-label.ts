// The label beside the scrollbar thumb while the person scrolls: the page at the top of the view, in the readout's words.
import type { ScriptEditor, Timers } from "@manent/editor";
import { READOUT_WORDS } from "@manent/ui";
import { productionServicesFor } from "../production/live-services.ts";

/** How long the label stays after the last scroll, and how long a wheel, a touch or a press on the scrollbar waits for one. */
const SHOWN_AFTER_MS = 1000;
/** How far inside the scroller's top edge the page is read. */
const PROBE_PX = 4;
/** Between the label and the scrollbar track or a covering panel. */
const GAP_PX = 10;
/** Reserved width when overlay scrollbars take no layout space. */
const OVERLAY_SCROLLBAR_PX = 16;
/** Minimum vertical inset from the scroller's top and bottom edges. */
const EDGE_INSET_PX = 8;

const NOTHING_TO_STOP = (): void => {};

// Calm overlay surface; the fade is left out under reduced motion. Drawn in the editor's host, without
// a layer of its own, so a menu or a dialog over the page covers it.
const LABEL_CLASS =
  "pointer-events-none fixed select-none rounded-surface border border-line bg-overlay px-2.5 py-1 text-meta font-medium whitespace-nowrap text-fg tabular-nums shadow-overlay opacity-0 motion-safe:transition-opacity motion-safe:duration-(--dur-base)";

/** The page at the top of the view: a front page by its label, or a page of the script by its index. */
type TopPage = { front: string } | { index: number };

/** The page at the scroller's top edge, a front page included; null where it is on none. */
function pageAtTop(
  editor: ScriptEditor,
  scroller: HTMLElement,
): TopPage | null {
  const top = scroller.getBoundingClientRect().top + PROBE_PX;
  const front = editor.frontPageAt(top);
  if (front !== null) return { front };
  const index = editor.pageAt(top);
  return index === null ? null : { index };
}

/**
 * The readout's sentence for `at`, counted from the pages as they are now; a page of the script carries its revision
 * when the document's Pages name one. Null once the page is gone.
 */
function sentenceOf(
  editor: ScriptEditor,
  docId: string,
  at: TopPage,
): string | null {
  const p = editor.pagination();
  if (p === null) return null;
  const count = p.pages.length;
  if ("front" in at) return READOUT_WORDS.page(at.front, count);
  const page = p.pages[at.index];
  if (page === undefined) return null;
  const revision =
    productionServicesFor(docId)?.pages.row(at.index)?.revisionName ?? null;
  return revision === null
    ? READOUT_WORDS.page(page.label, count)
    : READOUT_WORDS.pageWithRevision(page.label, revision, at.index + 1, count);
}

/**
 * Where the visible page ends at height `y`: the scroller's right edge (inset for overlay scrollbars when they take no
 * layout width), or the left edge of a region laid over it there, as the side panel is in a narrow window.
 */
function visibleRight(scroller: HTMLElement, y: number): number {
  const rect = scroller.getBoundingClientRect();
  const innerRight = rect.left + scroller.clientLeft + scroller.clientWidth;
  const cover = scroller.ownerDocument
    .elementFromPoint?.(innerRight - 1, y)
    ?.closest<HTMLElement>("[data-region]");
  if (cover != null && !cover.contains(scroller)) {
    return Math.min(innerRight, cover.getBoundingClientRect().left);
  }
  const layoutScrollbar = Math.max(
    0,
    scroller.offsetWidth - scroller.clientLeft - scroller.clientWidth,
  );
  return layoutScrollbar > 0 ? innerRight : innerRight - OVERLAY_SCROLLBAR_PX;
}

/** Places `label` beside `scroller`'s thumb, clamped within its vertical edges and clear of its scrollbar or a covering panel. */
function positionLabel(label: HTMLElement, scroller: HTMLElement): void {
  const { scrollTop, clientHeight, scrollHeight } = scroller;
  const rect = scroller.getBoundingClientRect();
  const thumb =
    rect.top + ((scrollTop + clientHeight / 2) / scrollHeight) * clientHeight;
  const minTop = rect.top + EDGE_INSET_PX;
  const maxTop = Math.max(
    minTop,
    rect.bottom - label.offsetHeight - EDGE_INSET_PX,
  );
  const top = Math.min(
    maxTop,
    Math.max(minTop, thumb - label.offsetHeight / 2),
  );
  const probeY = top + label.offsetHeight / 2;
  label.style.top = `${top}px`;
  label.style.right = `${scroller.ownerDocument.documentElement.clientWidth - visibleRight(scroller, probeY) + GAP_PX}px`;
}

/**
 * Shows the label beside the thumb of `scroller`, inside `host`, while the person scrolls it with the wheel, a touch
 * or its scrollbar and for SHOWN_AFTER_MS after, level with the thumb's centre; a scroll the page makes itself
 * (opening, going to a place, following the caret) shows nothing. Hidden from assistive technology: the status bar's
 * readout says the page. Returns the disposer.
 */
export function followThumb(options: {
  editor: ScriptEditor;
  scroller: HTMLElement;
  host: HTMLElement;
  docId: string;
  timers: Timers;
}): () => void {
  const { editor, scroller, host, docId, timers } = options;
  const label = host.ownerDocument.createElement("div");
  label.className = LABEL_CLASS;
  label.dataset["thumbLabel"] = "";
  label.setAttribute("aria-hidden", "true");
  host.append(label);
  let moving = false;
  let last: TopPage | null = null;
  let settle = NOTHING_TO_STOP;
  const hold = (): void => {
    moving = true;
    settle();
    settle = timers.schedule(() => {
      moving = false;
      label.style.opacity = "0";
    }, SHOWN_AFTER_MS);
  };
  const onScroll = (): void => {
    if (!moving) return;
    hold();
    if (scroller.scrollHeight <= scroller.clientHeight) return;
    last = pageAtTop(editor, scroller) ?? last;
    const text = last === null ? null : sentenceOf(editor, docId, last);
    if (text === null) return;
    label.textContent = text;
    positionLabel(label, scroller);
    label.style.opacity = "1";
  };
  // a press on the scrollbar lands on the scroller itself; one on the page lands on what it holds
  const onPress = (event: PointerEvent): void => {
    if (event.target === scroller) hold();
  };
  scroller.addEventListener("wheel", hold, { passive: true });
  scroller.addEventListener("touchmove", hold, { passive: true });
  scroller.addEventListener("pointerdown", onPress);
  scroller.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    scroller.removeEventListener("wheel", hold);
    scroller.removeEventListener("touchmove", hold);
    scroller.removeEventListener("pointerdown", onPress);
    scroller.removeEventListener("scroll", onScroll);
    settle();
    label.remove();
  };
}
