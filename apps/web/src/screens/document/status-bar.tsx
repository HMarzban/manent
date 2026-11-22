// The bar under the page: the Element button, the page and scene readouts, the message slot, View ▾ and Commands.
import { COMMANDS } from "@manent/commands";
import {
  Button,
  CommandButton,
  CommandMenu,
  DOCUMENT_WORDS,
  Kbd,
  MessageSlot,
  cn,
  READOUT_WORDS,
  keyLabel,
  useCommandState,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import type { LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import { panelsActions } from "../../state/panels.store.ts";
import { ElementButton } from "./element-button.tsx";
import { MenuFace } from "./menu-face.tsx";
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

/** A button for `commandId`, drawn only once the command is registered; `icon` leads its label. */
export function CommandAction(props: {
  commandId: string;
  label: string;
  icon?: LucideIcon;
}): ReactNode {
  const { run, registered } = useCommandActions();
  if (!registered(props.commandId)) return null;
  const { icon: Icon } = props;
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-ui"
      onClick={() => run(props.commandId)}
    >
      {Icon === undefined ? null : (
        <Icon
          aria-hidden="true"
          data-icon="inline-start"
          className="size-icon"
        />
      )}
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

/** The palette's button, with its key shown beside it on a window wide enough. */
function CommandsButton(): ReactNode {
  const { platform } = useCommands();
  const [chord] = useCommandState("app.palette").keys;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <CommandButton id="app.palette" size="sm" />
      {chord === undefined ? null : (
        <Kbd aria-hidden="true" className="max-sm:hidden">
          {keyLabel(chord, platform)}
        </Kbd>
      )}
    </span>
  );
}

/** Whether the message shown is about the person's own work, which takes two lines until it is dismissed. */
function useOwnWorkShown(): boolean {
  const { messages } = useServices();
  return useSyncExternalStore(
    messages.subscribe,
    () => messages.current()?.ownWork ?? false,
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
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-t border-line bg-chrome px-2 text-ui",
        useOwnWorkShown() ? "h-row-2" : "h-statusbar",
      )}
    >
      {/* a narrow window keeps Element, the page, View and Commands; a long element name gives way first */}
      <div className="w-element shrink-0 max-sm:w-auto max-sm:min-w-0 max-sm:max-w-28 max-sm:shrink">
        {docId === null ? null : <ElementButton docId={docId} />}
      </div>
      {readout === null ? null : (
        // Details at Script, with focus left where it is
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-meta font-normal text-fg-muted tabular-nums"
          onClick={() => panelsActions.open("side", "details")}
        >
          {readout}
        </Button>
      )}
      {scene === null ? null : (
        <span className="shrink-0 px-2 text-meta text-fg-muted tabular-nums max-sm:hidden">
          {READOUT_WORDS.scene(scene)}
        </span>
      )}
      <MessageSlot queue={messages} run={run} registered={registered} />
      <CommandMenu
        menu="view"
        label={DOCUMENT_WORDS.viewMenu}
        trigger={<MenuFace size="sm">{DOCUMENT_WORDS.viewMenu}</MenuFace>}
      />
      <CommandsButton />
      {docId === null ? null : <WritingNotices docId={docId} />}
    </ShellRegion>
  );
}
