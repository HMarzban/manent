// The status bar's Element button: the caret's element, which opens the element picker beside it.
import { Button, EDITOR_WORDS } from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { useAccess } from "./ruler-bar.tsx";

/** Absent while the caret is in no element; plain words on a page this person cannot edit. */
export function ElementButton(props: { docId: string }): ReactNode {
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const element = useEditorFact("element");
  const access = useAccess(props.docId);
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
      aria-label={EDITOR_WORDS.elementButton(element)}
      className="max-w-full text-ui"
      onClick={(event) => {
        // the picker's keys, Escape among them, are heard in the page
        dom.focusPage();
        editor.run({ kind: "picker", opener: event.currentTarget });
      }}
    >
      <span className="truncate">{element}</span>
      <ChevronDownIcon aria-hidden="true" className="size-icon text-fg-muted" />
    </Button>
  );
}
