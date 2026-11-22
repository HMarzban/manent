// The status bar's Element button: the caret's element, which opens the element picker.
import { Button, EDITOR_WORDS } from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { useAccess } from "./ruler-bar.tsx";

/** Absent while the caret is in no element; plain words on a page this person cannot edit. */
export function ElementButton(props: { docId: string }): ReactNode {
  const { commands } = useServices();
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
      aria-label={EDITOR_WORDS.elementButton(element)}
      className="max-w-full text-ui"
      onClick={() => commands.run("format.element", "control")}
    >
      <span className="truncate">{element}</span>
      <ChevronDownIcon aria-hidden="true" className="size-icon text-fg-muted" />
    </Button>
  );
}
