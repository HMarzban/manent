// What a cut, a paste and plain text become: ids kept through one cut and paste, and every block an element of the format.
import { sanitizeText } from "@manent/pagination";
import { schema } from "@manent/schema";
import type { ActBreakKind, BlockType, IdSource } from "@manent/schema";
import { DOMSerializer, Fragment, Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { pasteSlice } from "../sections/paste.ts";

/** The attribute a cut puts on the clipboard HTML's outer element; its value is the cut's marker. */
export const CUT_MARKER_ATTR = "data-manent-cut";

// the elements' own reference, written out here until this module can import it
interface ElementRef {
  readonly type: BlockType;
  readonly kind: ActBreakKind | null;
}

/** The marker of the last cut, until a paste or an undo or redo; null when there is none. */
type CutRecord = string | null;

const clipboardKey = new PluginKey<CutRecord>("clipboard");

/** The schema's serialiser, which marks its outer element while `take` gives a marker. */
class CutSerializer extends DOMSerializer {
  constructor(private readonly take: () => string | null) {
    const base = DOMSerializer.fromSchema(schema);
    super(base.nodes, base.marks);
  }

  override serializeFragment(
    fragment: Fragment,
    options?: { document?: Document },
    target?: HTMLElement | DocumentFragment,
  ): HTMLElement | DocumentFragment {
    const out = super.serializeFragment(fragment, options, target);
    // only the outermost call has no target: the nested ones fill a node's content
    if (target !== undefined) return out;
    const marker = this.take();
    const first = out.firstChild;
    if (marker !== null && first instanceof Element)
      first.setAttribute(CUT_MARKER_ATTR, marker);
    return out;
  }
}

/** Every block as `element` makes it, and every text as sanitizeText leaves it; a text it empties is dropped. */
function pastedFragment(
  fragment: Fragment,
  element: (block: Node) => Node,
): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const text = sanitizeText(node.text ?? "");
      if (text !== "") nodes.push(schema.text(text, node.marks));
      return;
    }
    const inner = node.copy(pastedFragment(node.content, element));
    nodes.push(node.type === schema.nodes.block ? element(inner) : inner);
  });
  return Fragment.from(nodes);
}

function lineBlock(line: string, element: ElementRef): Node {
  return schema.nodes.block.create(
    { type: element.type, kind: element.kind },
    line === "" ? null : schema.text(line),
  );
}

interface ClipboardOptions {
  ids: IdSource;
  plainElement(): ElementRef;
  formatElements(): readonly string[];
  random: () => string;
  isUndoRedo(tr: Transaction): boolean;
}

/** A block whose element is not in the format's list, as the format's plain element. */
function asFormat(options: ClipboardOptions): (block: Node) => Node {
  return (block) => {
    if (options.formatElements().includes(String(block.attrs.type)))
      return block;
    const { type, kind } = options.plainElement();
    return block.type.create({ ...block.attrs, type, kind }, block.content);
  };
}

/** A cut of a selection records a new marker, outside history, and hands it to `arm` for the serialiser. */
function cutHandler(
  options: ClipboardOptions,
  arm: (marker: string) => void,
): (view: EditorView) => boolean {
  return (view) => {
    if (view.state.selection.empty) return false;
    const marker = options.random();
    arm(marker);
    view.dispatch(
      view.state.tr
        .setMeta(clipboardKey, marker)
        .setMeta("addToHistory", false),
    );
    return false;
  };
}

/** Every paste in one transaction: ids kept for HTML carrying the recorded marker, new ones otherwise. */
function pasteHandler(
  options: ClipboardOptions,
): (view: EditorView, event: ClipboardEvent, slice: Slice) => boolean {
  return (view, event, slice) => {
    const record = clipboardKey.getState(view.state)!;
    const html = event.clipboardData?.getData("text/html") ?? "";
    const keepIds =
      record !== null && html.includes(`${CUT_MARKER_ATTR}="${record}"`);
    view.dispatch(
      pasteSlice(view.state, slice, options.ids, { keepIds })
        .setMeta(clipboardKey, null)
        .scrollIntoView(),
    );
    return true;
  };
}

/** Plain text as one block of the plain element per line. */
function textParser(options: ClipboardOptions): (text: string) => Slice {
  return (text) => {
    const element = options.plainElement();
    const lines = sanitizeText(text).split("\n");
    return new Slice(
      Fragment.from(lines.map((line) => lineBlock(line, element))),
      0,
      0,
    );
  };
}

/**
 * Ids, elements and text on the clipboard. A cut marks the clipboard HTML with a marker from `random`; the first
 * paste of HTML carrying it keeps the blocks' ids, and any other paste gives new ones from `ids`. A paste or an
 * undo or redo forgets the cut. Plain text is one `plainElement()` per line; a pasted block whose element is not
 * in `formatElements()` becomes `plainElement()`. Placed before section editing, whose cut still writes the clipboard.
 */
export function clipboardPlugin(options: ClipboardOptions): Plugin {
  // the marker of the cut being written to the clipboard now
  let cutting: string | null = null;
  const take = () => {
    const marker = cutting;
    cutting = null;
    return marker;
  };
  const element = asFormat(options);
  return new Plugin<CutRecord>({
    key: clipboardKey,
    state: {
      init: () => null,
      apply: (tr, record) => {
        const meta: CutRecord | undefined = tr.getMeta(clipboardKey);
        if (meta !== undefined) return meta;
        return options.isUndoRedo(tr) ? null : record;
      },
    },
    props: {
      clipboardSerializer: new CutSerializer(take),
      handleDOMEvents: {
        cut: cutHandler(options, (marker) => {
          cutting = marker;
        }),
      },
      handlePaste: pasteHandler(options),
      clipboardTextParser: textParser(options),
      transformPasted: (slice) =>
        new Slice(
          pastedFragment(slice.content, element),
          slice.openStart,
          slice.openEnd,
        ),
    },
  });
}
