// Details → Script → Checks: the list every Send form shows at its top, in a disclosure whose label counts what
// needs a look.
import {
  CHECKS_WORDS,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@manent/ui";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { ChecksList, findChecks } from "../../checks/checks-list.tsx";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../editor-host/live-editor.ts";
import {
  CHECKS_PART,
  consumeChecksOpen,
  hasPendingChecksOpen,
  subscribeChecksOpen,
} from "./checks-part.ts";

/**
 * Closed at first, as the count says enough. The checks are found when the section is drawn, when the script's editor
 * opens or leaves, and each time the list is opened; never on a keystroke.
 */
export function ChecksSection(props: { docId: string }): ReactNode {
  const { docId } = props;
  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );
  const [open, setOpen] = useState(hasPendingChecksOpen);
  const [openings, setOpenings] = useState(0);
  useEffect(() => {
    if (consumeChecksOpen()) {
      setOpen(true);
      setOpenings((n) => n + 1);
    }
    return subscribeChecksOpen(() => {
      setOpen(true);
      setOpenings((n) => n + 1);
    });
  }, []);
  // the editor and each opening are what make the checks worth finding again
  const checks = useMemo(() => findChecks(docId), [docId, editor, openings]);
  return (
    <Collapsible
      {...{ [CHECKS_PART]: "" }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setOpenings((n) => n + 1);
      }}
      className="flex flex-col gap-2"
    >
      {/* a quiet row, its chevron where the rows' words begin, as Script settings draws its own */}
      <CollapsibleTrigger className="group/disclosure -mx-2 flex min-h-row items-center gap-1 rounded-control px-1 text-start text-ui font-semibold transition-colors hover:bg-subtle active:bg-control">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-muted duration-(--dur-fast) ease-out group-hover/disclosure:text-fg group-data-panel-open/disclosure:rotate-90 motion-safe:transition-transform"
        />
        {CHECKS_WORDS.heading(checks.length)}
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in duration-(--dur-fast) ease-out fade-in-0">
        <ChecksList checks={checks} />
      </CollapsibleContent>
    </Collapsible>
  );
}
