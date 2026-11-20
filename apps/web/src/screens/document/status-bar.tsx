// The bar under the page: the Element button, the page and scene readouts, the message slot, View ▾ and Commands.
import { COMMANDS } from "@manent/commands";
import {
  Button,
  CommandButton,
  CommandMenu,
  DOCUMENT_WORDS,
  Kbd,
  MessageSlot,
  READOUT_WORDS,
  keyLabel,
  useCommandState,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { panelsActions } from "../../state/panels.store.ts";
import { ElementButton } from "./element-button.tsx";
import { WritingNotices } from "./writing-notices.tsx";

/** Runs a command a bar's action names, and says whether it is registered: an action whose command is not is not drawn. */
export function useCommandActions(): {
  run(commandId: string): void;
  registered(commandId: string): boolean;
} {
  const { commands } = useServices();
  return {
    run(commandId) {
      commands.run(commandId, "control");
    },
    registered: (commandId) =>
      COMMANDS.some((command) => command.id === commandId),
  };
}

/** A button for `commandId`, drawn only once the command is registered. */
export function CommandAction(props: {
  commandId: string;
  label: string;
}): ReactNode {
  const { run, registered } = useCommandActions();
  if (!registered(props.commandId)) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => run(props.commandId)}>
      {props.label}
    </Button>
  );
}

/** `Page 12 of 52`, or `Page 12A · Blue (14 of 112)` on a page of a revision; null while the caret is on no page. */
function usePageReadout(): string | null {
  const page = useEditorFact("page");
  const pageCount = useEditorFact("pageCount");
  const revision = useEditorFact("pageRevision");
  const ordinal = useEditorFact("pageOrdinal");
  if (page === null || pageCount === null) return null;
  if (revision === null || ordinal === null)
    return READOUT_WORDS.page(page, pageCount);
  return READOUT_WORDS.pageWithRevision(page, revision, ordinal, pageCount);
}

/** The palette's button, with its key shown beside it. */
function CommandsButton(): ReactNode {
  const { platform } = useCommands();
  const [chord] = useCommandState("app.palette").keys;
  return (
    <span className="flex items-center gap-1">
      <CommandButton id="app.palette" size="sm" />
      {chord === undefined ? null : (
        <Kbd aria-hidden="true">{keyLabel(chord, platform)}</Kbd>
      )}
    </span>
  );
}

export function StatusBar(): ReactNode {
  const { messages } = useServices();
  const { run, registered } = useCommandActions();
  const readout = usePageReadout();
  const scene = useEditorFact("scene");
  const { docId } = useSubscribable(useEnvironment().shellState);
  return (
    <ShellRegion
      region="status_bar"
      // on a window too narrow for every control the bar scrolls, never the window
      className="flex h-statusbar items-center gap-2 overflow-x-auto border-t border-line bg-chrome px-2 text-ui"
    >
      <div className="w-34 shrink-0">
        <ElementButton />
      </div>
      {readout === null ? null : (
        // Details at Script, with focus left where it is
        <Button
          variant="ghost"
          size="sm"
          onClick={() => panelsActions.open("side", "details")}
        >
          {readout}
        </Button>
      )}
      {scene === null ? null : <span>{READOUT_WORDS.scene(scene)}</span>}
      <MessageSlot queue={messages} run={run} registered={registered} />
      <CommandMenu
        menu="view"
        label={DOCUMENT_WORDS.viewMenu}
        trigger={
          <span className="flex items-center gap-1">
            {DOCUMENT_WORDS.viewMenu}
            <span aria-hidden="true">▾</span>
          </span>
        }
      />
      <CommandsButton />
      {docId === null ? null : <WritingNotices docId={docId} />}
    </ShellRegion>
  );
}
