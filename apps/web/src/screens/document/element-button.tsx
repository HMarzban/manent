// The status bar's Element button: the caret's element, which opens the element picker beside it.
import { Button, EDITOR_WORDS, GRAPHICS_WORDS } from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { openDetailsAt } from "./details-tab.tsx";
import { useAccess } from "./ruler-bar.tsx";

const PICKER_ID = "mn-picker";

/** Absent while the caret is in no element; plain words on a page this person cannot edit. */
export function ElementButton(props: { docId: string }): ReactNode {
  const { commands } = useServices();
  const { dom, frame } = useEnvironment();
  const element = useEditorFact("element");
  const access = useAccess(props.docId);
  const isGraphic = element === GRAPHICS_WORDS.graphic;
  const editable =
    element !== null && !isGraphic && (access === null || access === "edit");
  // a press takes focus from the page, which closes an open picker before the click: that click leaves it closed
  const pressedOpen = useRef(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!editable) {
      setOpen(false);
      return undefined;
    }
    const sync = (): void =>
      setOpen(document.getElementById(PICKER_ID) !== null);
    const observer = new MutationObserver(sync);
    const attach = (): void => {
      observer.disconnect();
      // the picker mounts as a direct child of the editor's .mn-layer (or body in tests); never observe a subtree
      observer.observe(document.body, { childList: true });
      const layer =
        liveEditor(props.docId)
          ?.view.dom.closest("[data-region='page']")
          ?.querySelector(".mn-layer") ?? document.querySelector(".mn-layer");
      if (layer !== null) observer.observe(layer, { childList: true });
      sync();
    };
    attach();
    const stopEditors = subscribeLiveEditors(attach);
    return () => {
      stopEditors();
      observer.disconnect();
    };
  }, [editable, props.docId]);
  if (element === null) return null;
  if (isGraphic)
    return (
      <Button
        variant="ghost"
        size="sm"
        data-tour="readout:element"
        className="max-w-full text-ui"
        onClick={() => openDetailsAt("selection", frame)}
      >
        <span className="truncate">{element}</span>
      </Button>
    );
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
      aria-expanded={open}
      // the picker's list, which the page draws beside the control that names it
      aria-controls={open ? PICKER_ID : undefined}
      aria-label={EDITOR_WORDS.elementButton(element)}
      className="max-w-full text-ui"
      onPointerDown={() => {
        pressedOpen.current = document.getElementById(PICKER_ID) !== null;
      }}
      onClick={(event) => {
        const toggled = event.detail > 0 && pressedOpen.current;
        pressedOpen.current = false;
        if (toggled) return;
        // pickerPlugin locates its anchor via [aria-controls="mn-picker"] while opening; clear it again if nothing opened
        const button = event.currentTarget;
        button.setAttribute("aria-controls", PICKER_ID);
        // the picker's keys, Escape among them, are heard in the page; it opens first, so it is placed beside this button
        const result = commands.run("format.element", "control");
        const nowOpen = document.getElementById(PICKER_ID) !== null;
        if (!nowOpen) button.removeAttribute("aria-controls");
        if (result === "ran") {
          setOpen(nowOpen);
          dom.focusPage();
        }
      }}
    >
      <span className="truncate">{element}</span>
      <ChevronDownIcon aria-hidden="true" className="size-icon text-fg-muted" />
    </Button>
  );
}
