// One title page field as a box of plain text on its sheet: typed into, kept in step with the shared map, undone
// through the script's history rather than the browser's.
import type { TitlePageField } from "@manent/schema";

export interface FieldKeys {
  /** Runs the script's undo (false) or redo (true). */
  history(redo: boolean): void;
  readonly platform: "mac" | "windows" | "linux";
}

export interface FieldBox {
  readonly element: HTMLElement;
  readonly field: TitlePageField;
  /** Shows `text`, keeping the caret's offset, clamped to it, while the field is being edited. */
  show(text: string): void;
  focus(): void;
}

// The caret's offset in the box's text; null when the selection is not inside it.
function caretOffset(element: HTMLElement): number | null {
  const selection = element.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return null;
  const before = element.ownerDocument.createRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function placeCaret(element: HTMLElement, offset: number): void {
  const selection = element.ownerDocument.getSelection();
  if (selection === null) return;
  const text = element.firstChild;
  const range = element.ownerDocument.createRange();
  if (text === null) range.setStart(element, 0);
  else range.setStart(text, Math.min(offset, text.textContent?.length ?? 0));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

// Mod+Z and Shift+Mod+Z (and Ctrl+Y off a Mac) as the script's undo and redo; null for any other key.
function historyOf(event: KeyboardEvent, keys: FieldKeys): boolean | null {
  const mod = keys.platform === "mac" ? event.metaKey : event.ctrlKey;
  if (!mod || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey;
  return key === "y" && keys.platform !== "mac" && !event.shiftKey
    ? true
    : null;
}

/** A box for `field` that writes each change through `write`; read-only when `editable` is false. */
export function createFieldBox(options: {
  doc: Document;
  field: TitlePageField;
  word: string;
  editable: boolean;
  write(text: string): void;
  keys: FieldKeys;
}): FieldBox {
  const { field, keys } = options;
  const element = options.doc.createElement("div");
  element.className = "mn-front-field";
  element.dataset["field"] = field;
  element.setAttribute("aria-label", options.word);
  element.setAttribute("role", "textbox");
  element.setAttribute("aria-multiline", "true");
  if (options.editable) {
    element.contentEditable = "plaintext-only";
    element.dataset["placeholder"] = options.word;
  } else element.setAttribute("aria-readonly", "true");
  element.addEventListener("input", () => {
    const text = element.textContent ?? "";
    // an emptied box may keep a line break element, which would hide its placeholder
    if (text === "") element.replaceChildren();
    options.write(text);
  });
  element.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    const redo = historyOf(event, keys);
    if (redo === null) return;
    event.preventDefault();
    keys.history(redo);
  });
  element.addEventListener("beforeinput", (event) => {
    if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo")
      return;
    event.preventDefault();
    keys.history(event.inputType === "historyRedo");
  });
  return {
    element,
    field,
    show(text) {
      if (element.textContent === text) return;
      const offset = caretOffset(element);
      element.textContent = text;
      if (offset !== null) placeCaret(element, offset);
    },
    focus() {
      element.focus();
      placeCaret(element, element.textContent?.length ?? 0);
    },
  };
}
