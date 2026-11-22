// A version's row menu, from its handle, a right-click or the context-menu key: Restore, Restore this scene, Name
// this draft…, then what other features add to a version's row.
import type { CommandId } from "@manent/commands";
import type { VersionContent } from "@manent/sync-protocol";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PRODUCTION_WORDS,
  READOUT_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useCommandState,
} from "@manent/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import type { HistoryRow } from "../../history/history-rows.ts";
import { selectRow } from "../../history/history-view.ts";
import { ROW_EXTENSIONS } from "../../history/row-extensions.ts";
import { useServices } from "../../services/context.tsx";
import { useEditorFact } from "../../state/facts.store.ts";

interface MenuEntry {
  id: string;
  label: string;
  /** The reason clause of an entry that cannot run now; null when it can. */
  whyNot: string | null;
  enabled: boolean;
  act(): void;
}

/** What the version's content allows: unknown until the menu has asked for it. */
type Held =
  { kind: "unknown" } | { kind: "known"; content: VersionContent | null };

const UNKNOWN: Held = Object.freeze({ kind: "unknown" });

function useEntries(
  docId: string,
  row: HistoryRow,
  held: Held,
  offline: boolean,
  onName: () => void,
): readonly MenuEntry[] {
  const { commands } = useServices();
  const restore = useCommandState("history.restore");
  const restoreScene = useCommandState("history.restoreScene");
  const nameDraft = useCommandState("history.nameDraft");
  const caretScene = useEditorFact("sceneId");
  const content = held.kind === "known" ? held.content : null;
  // offline, only a version whose content this device holds can be restored
  const needsConnection = offline && held.kind === "known" && content === null;
  const whyNot = needsConnection ? PRODUCTION_WORDS.connectionReason : null;
  const sceneHeld =
    caretScene !== null &&
    content !== null &&
    content.blocks.some((block) => block.attrs?.id === caretScene);
  const run = (id: CommandId) => (): void => {
    selectRow(row);
    commands.run(id, "menu");
  };
  const entries: MenuEntry[] = [];
  if (restore.visible)
    entries.push({
      id: "history.restore",
      label: restore.label,
      whyNot,
      enabled: !needsConnection,
      act: run("history.restore"),
    });
  if (restoreScene.visible)
    entries.push({
      id: "history.restoreScene",
      label: restoreScene.label,
      whyNot,
      enabled: sceneHeld && !needsConnection,
      act: run("history.restoreScene"),
    });
  if (nameDraft.visible)
    entries.push({
      id: "history.nameDraft",
      label: nameDraft.label,
      whyNot: null,
      enabled: true,
      act: onName,
    });
  for (const extension of ROW_EXTENSIONS)
    for (const id of extension.menu(docId, row.item)) {
      const state = commands.state(id);
      if (state.visible)
        entries.push({
          id,
          label: state.label,
          whyNot: state.whyNot,
          enabled: state.enabled,
          act: run(id),
        });
    }
  return entries;
}

/** An entry drawn as `Item`; one that cannot run says why in its tooltip ("Restore — needs a connection"). */
function Entry(props: {
  entry: MenuEntry;
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
}): ReactNode {
  const { entry, Item } = props;
  const item = (
    <Item disabled={!entry.enabled} onClick={entry.act}>
      {entry.label}
    </Item>
  );
  if (entry.whyNot === null) return item;
  return (
    <Tooltip>
      <TooltipTrigger render={item} />
      <TooltipContent>
        {READOUT_WORDS.unavailable(entry.label, entry.whyNot)}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * `children` draws the row with the menu's handle in it; the content of the version is asked for as a menu opens, so
 * that Restore this scene knows whether the version holds the caret's scene.
 */
export function HistoryRowMenu(props: {
  docId: string;
  row: HistoryRow;
  offline: boolean;
  onName(): void;
  children(handle: ReactNode): ReactNode;
}): ReactNode {
  const { docId, row } = props;
  const { history } = useServices();
  const [held, setHeld] = useState<Held>(UNKNOWN);
  const entries = useEntries(docId, row, held, props.offline, props.onName);
  const opened = (open: boolean): void => {
    if (!open || held.kind === "known") return;
    void history
      .content(docId, { versionId: row.item.id })
      .then((content) => setHeld({ kind: "known", content }));
  };
  if (entries.length === 0) return props.children(null);
  const handle = (
    // the handle's own click opens the menu, never the row
    <span onClick={(event) => event.stopPropagation()}>
      <DropdownMenu onOpenChange={opened}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={DOCUMENT_WORDS.rowMenuName(row.title)}
            />
          }
        >
          <span aria-hidden="true">⋯</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {entries.map((entry) => (
            <Entry key={entry.id} entry={entry} Item={DropdownMenuItem} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
  return (
    <ContextMenu onOpenChange={opened}>
      <ContextMenuTrigger>{props.children(handle)}</ContextMenuTrigger>
      <ContextMenuContent>
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} Item={ContextMenuItem} />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
