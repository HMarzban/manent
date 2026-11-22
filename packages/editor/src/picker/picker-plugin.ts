// The element picker: a list of the format's elements under the caret's line, chosen by its keys while focus stays in the page.
import type { FormatId } from "@manent/schema";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { ELEMENT_SLOTS, elementSlot, slotElement } from "../elements/index.ts";
import type { ElementSlot } from "../elements/index.ts";
import { elementOf, setElement } from "../keys/element-keys.ts";
import type { EditorWords, Frames } from "../script-editor/ports.ts";

/** `layer` lies outside the zoomed container, so the list keeps its own size at any zoom. */
export interface PickerOptions {
  format(): FormatId;
  words: EditorWords;
  layer: HTMLElement;
  frames: Frames;
}

interface PickerState {
  open: boolean;
  /** The active option's place among the options the format offers. */
  active: number;
}

type PickerMeta =
  | { readonly type: "open" }
  | { readonly type: "close" }
  | { readonly type: "move"; readonly active: number };

export const pickerKey: PluginKey<PickerState> = new PluginKey("picker");

const CLOSED: PickerState = Object.freeze({ open: false, active: 0 });
const LIST_ID = "mn-picker";

const optionId = (slot: ElementSlot): string => `${LIST_ID}-${slot}`;

function offeredSlots(format: FormatId): ElementSlot[] {
  return ELEMENT_SLOTS.filter((slot) => slotElement(format, slot) !== null);
}

/** The option of the caret block's element, or the first. */
function currentOption(state: EditorState, format: FormatId): number {
  const block = state.selection.$head.parent;
  const slot = elementSlot(
    format,
    elementOf(String(block.attrs.type), block.attrs.kind),
  );
  return slot === null ? 0 : offeredSlots(format).indexOf(slot);
}

const CLOSE: PickerMeta = Object.freeze({ type: "close" });
/** Held down on the way to a chord or a capital, so they leave the picker open. */
const MODIFIER_KEYS: readonly string[] = Object.freeze([
  "Shift",
  "Control",
  "Alt",
  "Meta",
]);

function send(view: EditorView, meta: PickerMeta): void {
  view.dispatch(view.state.tr.setMeta(pickerKey, meta));
}

/** Opens the element picker at the caret; it does nothing in an editor without the picker. */
export function openPicker(view: EditorView): void {
  send(view, { type: "open" });
}

function choose(view: EditorView, format: FormatId, slot: ElementSlot): void {
  const element = slotElement(format, slot);
  if (element === null) return;
  setElement(element)(view.state, (tr) =>
    view.dispatch(tr.setMeta(pickerKey, CLOSE)),
  );
}

/** A key's slot: by its place on the keyboard first, then by the character it types; a shortcut chooses none. */
function slotOfKey(
  event: KeyboardEvent,
  offered: readonly ElementSlot[],
): ElementSlot | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const byPlace = offered.find(
    (slot) => event.code === (/\d/.test(slot) ? `Digit${slot}` : `Key${slot}`),
  );
  return (
    byPlace ?? offered.find((slot) => slot === event.key.toUpperCase()) ?? null
  );
}

function handleKey(
  view: EditorView,
  event: KeyboardEvent,
  format: FormatId,
): boolean {
  const { active } = pickerKey.getState(view.state) ?? CLOSED;
  const offered = offeredSlots(format);
  if (event.key === "Escape") {
    event.stopPropagation();
    send(view, CLOSE);
    return true;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const to = active + (event.key === "ArrowDown" ? 1 : -1);
    send(view, {
      type: "move",
      active: Math.min(Math.max(to, 0), offered.length - 1),
    });
    return true;
  }
  if (event.key === "Enter") {
    const slot = offered[active];
    if (slot !== undefined) choose(view, format, slot);
    return true;
  }
  // the picker owns Tab while open, so the line keeps its element and focus stays in the page
  if (event.key === "Tab") return true;
  const slot = slotOfKey(event, offered);
  if (slot !== null) {
    choose(view, format, slot);
    return true;
  }
  if (!MODIFIER_KEYS.includes(event.key)) send(view, CLOSE);
  return false;
}

function drawList(
  view: EditorView,
  options: PickerOptions,
  format: FormatId,
): HTMLElement {
  const doc = options.layer.ownerDocument;
  const list = doc.createElement("div");
  list.id = LIST_ID;
  list.className = "mn-picker";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", options.words.picker);
  for (const slot of ELEMENT_SLOTS) {
    const element = slotElement(format, slot);
    if (element === null) continue;
    const option = doc.createElement("div");
    option.id = optionId(slot);
    option.setAttribute("role", "option");
    const label = doc.createElement("span");
    label.textContent = options.words.element(
      format,
      element.type,
      element.kind,
    );
    const key = doc.createElement("kbd");
    key.textContent = slot;
    option.append(label, key);
    // a press keeps focus in the page, then chooses
    option.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      choose(view, format, slot);
    });
    list.append(option);
  }
  return list;
}

/** Puts the list in a frame below the caret's line, in the layer's own coordinates. */
function placeList(
  view: EditorView,
  list: HTMLElement,
  layer: HTMLElement,
): void {
  const caret = view.coordsAtPos(view.state.selection.head);
  const origin = layer.getBoundingClientRect();
  list.style.position = "absolute";
  list.style.left = `${caret.left - origin.left}px`;
  list.style.top = `${caret.bottom - origin.top}px`;
}

function markActive(list: HTMLElement, active: number): void {
  [...list.children].forEach((option, i) =>
    option.setAttribute("aria-selected", String(i === active)),
  );
}

/** The element picker; it opens through openPicker, and while open its keys are the slots, the arrows, Enter, Tab and Escape. Any other key, which then reaches the page, or a caret move closes it. */
export function pickerPlugin(options: PickerOptions): Plugin {
  return new Plugin<PickerState>({
    key: pickerKey,
    state: {
      init: () => CLOSED,
      apply: (tr, value, _before, state) => {
        const meta: PickerMeta | undefined = tr.getMeta(pickerKey);
        // a remote change also sets the selection, to keep the caret in place, but it changes the doc
        if (meta === undefined)
          return value.open && tr.selectionSet && !tr.docChanged
            ? CLOSED
            : value;
        switch (meta.type) {
          case "open":
            return {
              open: true,
              active: currentOption(state, options.format()),
            };
          case "close":
            return CLOSED;
          case "move":
            return value.open ? { open: true, active: meta.active } : value;
        }
      },
    },
    props: {
      handleKeyDown: (view, event) =>
        !view.composing &&
        !event.isComposing &&
        (pickerKey.getState(view.state)?.open ?? false) &&
        handleKey(view, event, options.format()),
      attributes: (state): Record<string, string> => {
        const picker = pickerKey.getState(state) ?? CLOSED;
        if (!picker.open) return {};
        const slot = offeredSlots(options.format())[picker.active];
        if (slot === undefined) return {};
        return {
          "aria-controls": LIST_ID,
          "aria-activedescendant": optionId(slot),
        };
      },
    },
    view: () => {
      let list: HTMLElement | null = null;
      let cancelPlace: (() => void) | null = null;
      const remove = () => {
        cancelPlace?.();
        list?.remove();
        list = null;
        cancelPlace = null;
      };
      return {
        update: (view, before) => {
          const now = pickerKey.getState(view.state) ?? CLOSED;
          if (view.composing || now === pickerKey.getState(before)) return;
          if (!now.open) {
            remove();
            return;
          }
          if (list === null) {
            const drawn = drawList(view, options, options.format());
            list = drawn;
            options.layer.append(drawn);
            cancelPlace = options.frames.request(() =>
              placeList(view, drawn, options.layer),
            );
          }
          markActive(list, now.active);
        },
        destroy: remove,
      };
    },
  });
}
