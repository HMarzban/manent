// The status bar's Element button: the caret's element, which opens the element picker beside it.
import { Button, EDITOR_WORDS } from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import { useRef } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { useAccess } from "./ruler-bar.tsx";

/** Absent while the caret is in no element; plain words on a page this person cannot edit. */
export function ElementButton(props: { docId: string }): ReactNode {
  const { commands } = useServices();
  const { dom } = useEnvironment();
  const element = useEditorFact("element");
  const access = useAccess(props.docId);
  // a press takes focus from the page, which closes an open picker before the click: that click leaves it closed
  const pressedOpen = useRef(false);
  if (element === null) return null;
  if (access !== null && access !== "edit")
    return (
      <span className="block truncate px-2 text-ui text-fg-muted">
        {element}
      </span>
    );
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="readout:element"
      aria-haspopup="listbox"
      // the picker's list, which the page draws beside the control that names it
      aria-controls="mn-picker"
      aria-label={EDITOR_WORDS.elementButton(element)}
      className="max-w-full text-ui"
      onPointerDown={() => {
        pressedOpen.current = document.getElementById("mn-picker") !== null;
      }}
      onClick={(event) => {
        const toggled = event.detail > 0 && pressedOpen.current;
        pressedOpen.current = false;
        if (toggled) return;
        // the picker's keys, Escape among them, are heard in the page; it opens first, so it is placed beside this button
        if (commands.run("format.element", "control") === "ran")
          dom.focusPage();
      }}
    >
      <span className="truncate">{element}</span>
      <ChevronDownIcon aria-hidden="true" className="size-icon text-fg-muted" />
    </Button>
  );
}
