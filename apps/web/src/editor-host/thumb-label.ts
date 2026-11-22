// The label beside the scrollbar thumb while the person scrolls: the page at the top of the view, in the readout's words.
import type { ScriptEditor, Timers } from "@manent/editor";
import { READOUT_WORDS } from "@manent/ui";
import { productionServicesFor } from "../production/live-services.ts";

/** How long the label stays after the last scroll. */
const SHOWN_AFTER_MS = 1000;
/** How far inside the scroller's top edge the page is read. */
const PROBE_PX = 4;
/** Between the label and the scrollbar. */
const GAP_PX = 4;

// The tooltip's surface (theme rule 13); the fade is left out under reduced motion.
const NOTHING_TO_STOP = (): void => {};

const LABEL_CLASS =
  "pointer-events-none fixed z-50 rounded-md bg-foreground text-background whitespace-nowrap opacity-0 motion-safe:transition-opacity motion-safe:duration-(--dur-base)";

/** The readout's sentence for the front page `label`, which the count leaves out. */
function frontLabelOf(editor: ScriptEditor, label: string): string | null {
  const p = editor.pagination();
  return p === null ? null : READOUT_WORDS.page(label, p.pages.length);
}

/** The readout's sentence for page `index`, with its revision when the document's Pages name one. */
function labelOf(
  editor: ScriptEditor,
  docId: string,
  index: number,
): string | null {
  const p = editor.pagination();
  const page = p?.pages[index];
  if (p === null || page === undefined) return null;
  const count = p.pages.length;
  const revision =
    productionServicesFor(docId)?.pages.row(index)?.revisionName ?? null;
  return revision === null
    ? READOUT_WORDS.page(page.label, count)
    : READOUT_WORDS.pageWithRevision(page.label, revision, index + 1, count);
}

/** The sentence for the page at the scroller's top edge, a front page included; null where it is on none. */
function labelAtTop(
  editor: ScriptEditor,
  scroller: HTMLElement,
  docId: string,
): string | null {
  const top = scroller.getBoundingClientRect().top + PROBE_PX;
  const front = editor.frontPageAt(top);
  if (front !== null) return frontLabelOf(editor, front);
  const index = editor.pageAt(top);
  return index === null ? null : labelOf(editor, docId, index);
}

/**
 * Shows the label beside the thumb of `scroller` while it scrolls and for SHOWN_AFTER_MS after, level with the
 * thumb's centre. Hidden from assistive technology: the status bar's readout says the page. Returns the disposer.
 */
export function followThumb(options: {
  editor: ScriptEditor;
  scroller: HTMLElement;
  docId: string;
  timers: Timers;
}): () => void {
  const { editor, scroller, docId, timers } = options;
  const label = scroller.ownerDocument.createElement("div");
  label.className = LABEL_CLASS;
  label.dataset["slot"] = "tooltip-content";
  label.setAttribute("aria-hidden", "true");
  scroller.ownerDocument.body.append(label);
  let hide = NOTHING_TO_STOP;
  const onScroll = (): void => {
    const text = labelAtTop(editor, scroller, docId);
    if (text !== null) label.textContent = text;
    if (label.textContent === "") return;
    const edge = scroller.getBoundingClientRect();
    const { scrollTop, clientHeight, scrollHeight, clientWidth } = scroller;
    const thumb =
      ((scrollTop + clientHeight / 2) / scrollHeight) * clientHeight;
    label.style.top = `${edge.top + thumb - label.offsetHeight / 2}px`;
    label.style.right = `${scroller.ownerDocument.documentElement.clientWidth - (edge.left + clientWidth) + GAP_PX}px`;
    label.style.opacity = "1";
    hide();
    hide = timers.schedule(() => {
      label.style.opacity = "0";
    }, SHOWN_AFTER_MS);
  };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    scroller.removeEventListener("scroll", onScroll);
    hide();
    label.remove();
  };
}
