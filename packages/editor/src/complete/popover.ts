// The autocomplete list: plain DOM in the editor's layer, outside the page, so focus never leaves the page.
const LIST_ID = "mn-complete";

const optionId = (index: number): string => `${LIST_ID}-${index}`;

export interface CompletePopover {
  /** The page's attributes that tie it to the list: the list is open, and `active` is the option chosen. */
  attributes(open: boolean, active: number): Record<string, string>;
  show(items: readonly string[], active: number): void;
  /** Px from the layer's top left corner. */
  place(left: number, top: number): void;
  hide(): void;
}

/** A listbox of `role="option"` items, appended to `layer` while it is shown. */
export function createCompletePopover(options: {
  layer: HTMLElement;
}): CompletePopover {
  const list = options.layer.ownerDocument.createElement("div");
  list.id = LIST_ID;
  list.setAttribute("role", "listbox");
  list.style.position = "absolute";
  let shown: readonly string[] | null = null;
  return {
    attributes(open, active): Record<string, string> {
      if (!open)
        return { "aria-autocomplete": "list", "aria-expanded": "false" };
      return {
        "aria-autocomplete": "list",
        "aria-expanded": "true",
        "aria-controls": LIST_ID,
        "aria-activedescendant": optionId(active),
      };
    },
    show(items, active) {
      if (items !== shown) {
        list.replaceChildren(
          ...items.map((item, i) => {
            const option = list.ownerDocument.createElement("div");
            option.id = optionId(i);
            option.setAttribute("role", "option");
            option.textContent = item;
            return option;
          }),
        );
        shown = items;
      }
      [...list.children].forEach((option, i) =>
        option.setAttribute("aria-selected", String(i === active)),
      );
      if (list.parentNode !== options.layer) options.layer.append(list);
    },
    place(left, top) {
      list.style.left = `${left}px`;
      list.style.top = `${top}px`;
    },
    hide() {
      list.remove();
      shown = null;
    },
  };
}
