// The label beside the scrollbar thumb while the person scrolls: the page at the top of the view, in the readout's words.
import type { ScriptEditor, Timers } from "@manent/editor";
import { engineFor } from "@manent/pagination";
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

// The index of the page at the scroller's top edge; null where the top edge is on no block.
function pageAtTop(editor: ScriptEditor, scroller: HTMLElement): number | null {
  const p = editor.pagination();
  const engine = p === null ? null : engineFor(p.engineVersion);
  if (p === null || engine === null) return null;
  const edge = scroller.getBoundingClientRect();
  const column = editor.view.dom.getBoundingClientRect();
  const hit = editor.view.posAtCoords({
    left: (column.left + column.right) / 2,
    top: edge.top + PROBE_PX,
  });
  if (hit === null) return null;
  const { doc } = editor.view.state;
  const $pos = doc.resolve(hit.pos);
  if ($pos.depth < 2) return null;
  let block = $pos.index(1);
  for (let s = 0; s < $pos.index(0); s++) block += doc.child(s).childCount;
  return engine.pageOf(
    p,
    Math.min(block, p.blocks.length - 1),
    $pos.parentOffset,
  );
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
    const index = pageAtTop(editor, scroller);
    const text = index === null ? null : labelOf(editor, docId, index);
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
