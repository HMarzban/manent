// The status bar's Element button: the caret's element, which opens the element picker.
import { Button, EDITOR_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";

/** Absent while the caret is in no element. */
export function ElementButton(): ReactNode {
  const { commands } = useServices();
  const element = useEditorFact("element");
  if (element === null) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={EDITOR_WORDS.elementButton(element)}
      onClick={() => commands.run("format.element", "control")}
    >
      {element}
      <span aria-hidden="true">▾</span>
    </Button>
  );
}
