// Setting the caret block's element from a picker key, and opening the element picker.
import type { ElementSlot } from "../elements/slots.ts";
import { setElement } from "../keys/element-keys.ts";
import type { ActionEntry } from "./action-types.ts";

export const elementEntry: ActionEntry<{ kind: "element"; slot: ElementSlot }> =
  {
    readOnly: false,
    run: (view, action, context) => {
      const element = context.slotElement(context.format(), action.slot);
      if (element === null) return { ok: false, reason: "not_in_format" };
      setElement(element)(view.state, view.dispatch);
      return { ok: true };
    },
  };

/** `opener` is the control that opened the picker, which its list is placed beside; null: under the caret's line. */
export const pickerEntry: ActionEntry<{
  kind: "picker";
  opener: HTMLElement | null;
}> = {
  readOnly: false,
  run: (view, action, context) => {
    context.openPicker(view, action.opener);
    return { ok: true };
  },
};
