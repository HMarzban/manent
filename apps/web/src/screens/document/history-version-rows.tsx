// The rows of the History tab: Working; the versions and the changes to script settings under their days, or with
// Drafts only the drafts oldest first; delegates rundown documents to RundownVersionRows.
import { SETTINGS } from "@manent/settings";
import {
  Button,
  DOCUMENT_WORDS,
  HISTORY_WORDS,
  Row,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  VirtualRows,
  formatTime,
  useSubscribable,
} from "@manent/ui";
import { StarIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { baselineOfRow } from "../../history/baseline.ts";
import { isTitledByTime } from "../../history/history-rows.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { selectRow } from "../../history/history-view.ts";
import {
  useRowExtensionLine,
  useRowExtensionList,
} from "../../history/row-extensions.ts";
import type { RowLine } from "../../history/row-extensions.ts";
import { useSettingChanges } from "../../history/setting-changes.ts";
import type { SettingChange } from "../../history/setting-changes.ts";
import { useRundownView } from "../../rundown/rundown-session.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { historyActions, useHistory } from "../../state/history.store.ts";
import { NameField, nextDraftName, useDraftLadder } from "./draft-name.tsx";
import { HistoryRowMenu } from "./history-row-menu.tsx";
import type { DraftNaming } from "./history-rundown-dialog.tsx";
import {
  RundownVersionRows,
  VersionAvatars,
  itemsOfHistoryRows,
} from "./history-rundown-rows.tsx";
import { valueLabel } from "./setting-messages.ts";

export { useDraftNaming } from "./history-rundown-dialog.tsx";

// the next page is asked for while a row this close to the end is drawn
const MORE_WITHIN_ROWS = 50;
// the person, in a setting's row, when they made the change
const YOU = "you";
// a named draft's mark, before its name
const STAR = <StarIcon aria-hidden="true" className="size-icon" />;

function renderRowLine(line: RowLine): ReactNode {
  if (line.tooltip === null) return line.text;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-block max-w-full truncate align-bottom" />
        }
      >
        {line.text}
      </TooltipTrigger>
      <TooltipContent>{line.tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** The row's second line: another feature's, else the draft's namer or the changes it holds; none for an empty version. */
function useRowMeta(docId: string, row: HistoryRow): ReactNode {
  const chosen = useRowExtensionLine(docId, row.item);
  if (chosen !== null) return renderRowLine(chosen);
  const { item } = row;
  const text =
    item.kind === "named" || item.kind === "sent"
      ? HISTORY_WORDS.namedBy(nameOf(item.createdByUserId), row.time)
      : item.summary === null || item.summary.changes === 0
        ? null
        : HISTORY_WORDS.summary(item.summary.changes, item.summary.scenes);
  return text === null ? null : <span title={text}>{text}</span>;
}

function VersionRow(props: {
  docId: string;
  row: HistoryRow;
  offline: boolean;
  naming: string | null;
  onName(): void;
  name(name: string): void;
  onShow(): void;
}): ReactNode {
  const { docId, row } = props;
  const meta = useRowMeta(docId, row);
  const authors = row.item.summary?.authorUserIds ?? [];
  const selected = useHistory("selected") === row.item.id;
  const named = row.item.kind === "named" || row.item.kind === "sent";
  const title = row.item.name ?? (isTitledByTime(row) ? row.time : row.title);
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (
      event.key !== "Enter" ||
      !(event.target instanceof Element) ||
      !event.target.classList.contains("mn-row")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    selectRow(row);
    historyActions.setBaseline(baselineOfRow(row));
    historyActions.setMode("as_it_was");
  };
  return (
    <HistoryRowMenu
      docId={docId}
      row={row}
      offline={props.offline}
      onName={props.onName}
    >
      {(handle) => (
        <div onKeyDownCapture={onKeyDownCapture}>
          <Row
            selected={selected}
            leading={named ? STAR : undefined}
            meta={meta ?? undefined}
            trailing={[
              ...(authors.length === 0
                ? []
                : [<VersionAvatars key="avatars" userIds={authors} />]),
              ...(row.local === null ? [] : [HISTORY_WORDS.onDevice]),
            ]}
            menu={handle ?? undefined}
            onActivate={props.onShow}
          >
            <span title={title}>{title}</span>
          </Row>
          {props.naming === null ? null : (
            <NameField
              initial={props.naming}
              onName={props.name}
              onCancel={() => historyActions.setNaming(false)}
            />
          )}
        </div>
      )}
    </HistoryRowMenu>
  );
}

/**
 * Working, the focus target of naming; its name field while Working is named, once the list has `answered` and so
 * can offer the next draft's name; and the draft named and not yet answered.
 */
export function WorkingRow(props: {
  docId?: string;
  rows: readonly HistoryRow[];
  answered: boolean;
  draft: DraftNaming;
}): ReactNode {
  const { docId, rows, draft } = props;
  const ladder = useDraftLadder(docId);
  const naming = useHistory("naming");
  const selected = useHistory("selected");
  const rundownView = useRundownView(docId ?? "");
  const canName = rundownView === null || rundownView.access === "edit";
  const { pending } = draft;
  return (
    <>
      <Row
        rowRef={draft.working}
        selected={selected === null}
        onActivate={() => historyActions.select(null)}
      >
        {HISTORY_WORDS.workingLabel}
      </Row>
      {canName && naming && draft.target === null && props.answered ? (
        <NameField
          initial={nextDraftName(rows, ladder)}
          onName={(name) => draft.name(name, null)}
          onCancel={() => historyActions.setNaming(false)}
        />
      ) : null}
      {pending === null ? null : (
        <div>
          <Row
            leading={STAR}
            trailing={
              pending.failed
                ? []
                : [
                    <span key="waiting" aria-hidden="true">
                      …
                    </span>,
                  ]
            }
          >
            {pending.name}
          </Row>
          {pending.failed ? (
            <div className="flex items-center gap-2 px-2 pb-1 text-meta">
              <span>{HISTORY_WORDS.nameFailed}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => draft.name(pending.name, pending.fromVersionId)}
              >
                {HISTORY_WORDS.tryAgain}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

/** A change to a script setting: the setting, then who made it, when, and the value it replaced. */
function SettingRow(props: { change: SettingChange }): ReactNode {
  const { key, at, byUserId, was } = props.change;
  const { userId } = useServices();
  const label = SETTINGS.get(key).label;
  const meta = DOCUMENT_WORDS.setBy(
    byUserId === userId ? YOU : nameOf(byUserId),
    formatTime(at),
    valueLabel(key, was, "row"),
  );
  return (
    <Row meta={<span title={meta}>{meta}</span>}>
      <span title={label}>{label}</span>
    </Row>
  );
}

/** The versions and setting changes; `draft` is the History tab's naming, which a row menu's Name this draft… uses. */
export function VersionRows(props: {
  docId: string;
  rows: readonly HistoryRow[];
  offline: boolean;
  draft: DraftNaming;
  onNearEnd(): void;
  onShow(row: HistoryRow): void;
}): ReactNode {
  const { docId, rows, draft } = props;
  const { library } = useServices();
  const docKindSource = useMemo(
    () => library.docKindOf(docId),
    [library, docId],
  );
  const docKind = useSubscribable(docKindSource);
  useRowExtensionList(docId);
  const ladder = useDraftLadder(docId);
  const { now } = useEnvironment();
  const draftsOnly = useHistory("draftsOnly");
  const naming = useHistory("naming");
  const changes = useSettingChanges(docId);
  const drawnTo = useRef(0);
  const items = itemsOfHistoryRows(rows, changes, draftsOnly, now());
  useEffect(() => {
    if (
      docKind !== "rundown" &&
      drawnTo.current >= items.length - MORE_WITHIN_ROWS
    )
      props.onNearEnd();
  });
  if (docKind === "rundown") {
    return (
      <RundownVersionRows
        docId={docId}
        rows={rows}
        namingTarget={draft.target}
        onNameVersion={draft.nameVersion}
        onCommitName={(name, fromVersionId) => draft.name(name, fromVersionId)}
        onNearEnd={props.onNearEnd}
        onShow={props.onShow}
      />
    );
  }
  const renderRow = (index: number): ReactNode => {
    drawnTo.current = Math.max(drawnTo.current, index);
    const item = items[index]!;
    if (item.kind === "setting") return <SettingRow change={item.change} />;
    if (item.kind === "day")
      return <h4 className="mn-group-label">{item.label}</h4>;
    return (
      <VersionRow
        docId={docId}
        row={item.row}
        offline={props.offline}
        naming={
          naming && draft.target === item.row.item.id
            ? (item.row.item.name ?? nextDraftName(rows, ladder))
            : null
        }
        onName={() => draft.nameVersion(item.row.item.id)}
        name={(name) => draft.name(name, item.row.item.id)}
        onShow={() => props.onShow(item.row)}
      />
    );
  };
  return (
    <VirtualRows
      count={items.length}
      rowHeight="two"
      label={DOCUMENT_WORDS.historyTab}
      renderRow={renderRow}
    />
  );
}
