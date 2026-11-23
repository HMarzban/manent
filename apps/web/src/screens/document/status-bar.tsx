// The bar under the page: the readouts, the message slot, View ▾ and Commands; the Element, page and scene readouts.
import { COMMANDS } from "@manent/commands";
import {
  Button,
  CommandMenu,
  DOCUMENT_WORDS,
  MessageSlot,
  cn,
  READOUT_WORDS,
  useSubscribable,
} from "@manent/ui";
import type { LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { CommandsButton } from "../../shell/commands-button.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { useEditorFact } from "../../state/facts.store.ts";
import type { EditorFacts } from "../../state/facts.store.ts";
import { openDetailsAt } from "./details-tab.tsx";
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
export function pageReadoutOf(
  facts: Pick<
    EditorFacts,
    "page" | "pageCount" | "pageRevision" | "pageOrdinal"
  >,
): string | null {
  const { page, pageCount, pageRevision, pageOrdinal } = facts;
  if (page === null || pageCount === null) return null;
  if (pageRevision === null || pageOrdinal === null)
    return READOUT_WORDS.page(page, pageCount);
  return READOUT_WORDS.pageWithRevision(
    page,
    pageRevision,
    pageOrdinal,
    pageCount,
  );
}

/** The caret's element, in a column of its own width. */
export function ElementReadout(props: { docId: string }): ReactNode {
  return (
    // a narrow window keeps Element, the page, View and Commands; a long element name gives way first
    <div className="w-element shrink-0 max-sm:w-auto max-sm:min-w-0 max-sm:max-w-28 max-sm:shrink">
      <ElementButton docId={props.docId} />
    </div>
  );
}

/** The caret's page, which opens Details at the script. */
export function PageReadout(): ReactNode {
  const { frame } = useEnvironment();
  const readout = pageReadoutOf({
    page: useEditorFact("page"),
    pageCount: useEditorFact("pageCount"),
    pageRevision: useEditorFact("pageRevision"),
    pageOrdinal: useEditorFact("pageOrdinal"),
  });
  if (readout === null) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="status:page"
      className="shrink-0 text-meta font-normal text-fg-muted tabular-nums"
      onClick={() => openDetailsAt("script", frame)}
    >
      {readout}
    </Button>
  );
}

/** The caret's scene, which opens Details at the scene. */
export function SceneReadout(): ReactNode {
  const { frame } = useEnvironment();
  const scene = useEditorFact("scene");
  if (scene === null) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 text-meta font-normal text-fg-muted tabular-nums max-sm:hidden"
      onClick={() => openDetailsAt("scene", frame)}
    >
      {READOUT_WORDS.scene(scene)}
    </Button>
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

/** `readouts` lead the bar. */
export function StatusBar(props: { readouts: ReactNode }): ReactNode {
  const { messages } = useServices();
  const { run, registered } = useCommandActions();
  const { shellState } = useEnvironment();
  const { docId } = useSubscribable(shellState);
  return (
    <ShellRegion
      region="status_bar"
      // on a window too narrow for every control the bar scrolls, never the window
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-t border-line bg-chrome px-2 text-ui",
        useOwnWorkShown() ? "h-row-2" : "h-statusbar",
      )}
    >
      {props.readouts}
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
