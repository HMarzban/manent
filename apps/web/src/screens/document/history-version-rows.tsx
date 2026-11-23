// The rows of the History tab: Working; the versions and the changes to script settings under their days, or with
// Drafts only the drafts oldest first; the name field of Name this draft…, and a draft named and not yet answered.
import { SETTINGS } from "@manent/settings";
import {
  Avatar,
  Button,
  DOCUMENT_WORDS,
  HISTORY_WORDS,
  Row,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  VirtualRows,
  formatTime,
  joinNames,
} from "@manent/ui";
import { StarIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { baselineOfRow } from "../../history/baseline.ts";
import { isTitledByTime } from "../../history/history-rows.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { selectRow } from "../../history/history-view.ts";
import { ROW_EXTENSIONS } from "../../history/row-extensions.ts";
import { useSettingChanges } from "../../history/setting-changes.ts";
import type { SettingChange } from "../../history/setting-changes.ts";
import { initialsOf } from "../../initials.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { fullNameOf, nameOf } from "../../services/sync/index-entries.ts";
import { historyActions, useHistory } from "../../state/history.store.ts";
import { NameField, nextDraftName } from "./draft-name.tsx";
import { HistoryRowMenu } from "./history-row-menu.tsx";
import { valueLabel } from "./setting-messages.ts";

// the next page is asked for while a row this close to the end is drawn
const MORE_WITHIN_ROWS = 50;
// the person, in a setting's row, when they made the change
const YOU = "you";

type Item =
  | { kind: "day"; label: string }
  | { kind: "version"; row: HistoryRow }
  | { kind: "setting"; change: SettingChange };

interface Pending {
  name: string;
  fromVersionId: string | null;
  failed: boolean;
}

// a named draft's mark, before its name
const STAR = <StarIcon aria-hidden="true" className="size-icon" />;

/** Each day's versions and setting changes under its day, newest first; with Drafts only the drafts oldest first. */
function itemsOf(
  rows: readonly HistoryRow[],
  changes: readonly SettingChange[],
  draftsOnly: boolean,
  now: number,
): Item[] {
  if (draftsOnly)
    return rows
      .filter((row) => row.item.kind === "named")
      .toReversed()
      .map((row): Item => ({ kind: "version", row }));
  const dated = [
    ...rows.map((row) => ({
      at: row.item.createdAt,
      day: row.day,
      item: { kind: "version", row } satisfies Item,
    })),
    ...changes.map((change) => ({
      at: change.at,
      day: HISTORY_WORDS.dayGroup(change.at, now),
      item: { kind: "setting", change } satisfies Item,
    })),
  ].toSorted((a, b) => b.at - a.at);
  const items: Item[] = [];
  let day: string | null = null;
  for (const each of dated) {
    if (each.day !== day) items.push({ kind: "day", label: each.day });
    day = each.day;
    items.push(each.item);
  }
  return items;
}

/**
 * The avatars of the people whose changes the version holds, named together for a screen reader; each names its
 * person on hover. Drawn without colour: the script's colour for each person is not known here.
 */
function Avatars(props: { userIds: readonly string[] }): ReactNode {
  const { userIds } = props;
  if (userIds.length === 0) return null;
  return (
    <span
      role="img"
      aria-label={joinNames(userIds.map(nameOf))}
      className="flex gap-1"
    >
      {userIds.map((userId) => {
        const name = fullNameOf(userId);
        return (
          <Tooltip key={userId}>
            <TooltipTrigger render={<span className="flex" />}>
              <Avatar
                name={name}
                initials={initialsOf(name)}
                colour={null}
                size="sm"
                decorative
              />
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

/** The row's second line: another feature's, else the draft's namer or the changes it holds. */
function metaOf(docId: string, row: HistoryRow): string | null {
  for (const extension of ROW_EXTENSIONS) {
    const line = extension.line(docId, row.item);
    if (line !== null) return line;
  }
  const { item } = row;
  if (item.kind === "named")
    return HISTORY_WORDS.namedBy(nameOf(item.createdByUserId), row.time);
  return item.summary === null
    ? null
    : HISTORY_WORDS.summary(item.summary.changes, item.summary.scenes);
}

function VersionRow(props: {
  docId: string;
  row: HistoryRow;
  offline: boolean;
  /** The name field's first text while this row is named; null while it is not. */
  naming: string | null;
  onName(): void;
  name(name: string): void;
  /** A click: the version's changes, shown the way Show says. */
  onShow(): void;
}): ReactNode {
  const { docId, row } = props;
  const meta = metaOf(docId, row);
  const authors = row.item.summary?.authorUserIds ?? [];
  const selected = useHistory("selected") === row.item.id;
  const named = row.item.kind === "named";
  // Enter opens the version as it was; a click shows its changes the way Show says
  const onKeyDownCapture = (event: KeyboardEvent): void => {
    if (
      event.key !== "Enter" ||
      event.target !== event.currentTarget.firstChild
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
            meta={meta === null ? undefined : meta}
            trailing={[
              ...(authors.length === 0
                ? []
                : [<Avatars key="avatars" userIds={authors} />]),
              ...(row.local === null ? [] : [HISTORY_WORDS.onDevice]),
              ...(handle === null ? [] : [handle]),
            ]}
            onActivate={props.onShow}
          >
            {row.item.name ?? (isTitledByTime(row) ? row.time : row.title)}
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
 * A draft named and not yet answered, shown under Working; `target` is the version whose row holds the name field,
 * null for Working; `name` names a draft of Working or of a version.
 */
interface DraftNaming {
  pending: Pending | null;
  target: string | null;
  nameVersion(versionId: string): void;
  name(draft: string, fromVersionId: string | null): void;
  working: RefObject<HTMLElement | null>;
}

export function useDraftNaming(docId: string): DraftNaming {
  const { history } = useServices();
  const naming = useHistory("naming");
  const [pending, setPending] = useState<Pending | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const working = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!naming) setTarget(null);
  }, [naming]);
  return {
    pending,
    target,
    working,
    nameVersion(versionId) {
      setTarget(versionId);
      historyActions.setNaming(true);
    },
    name(draft, fromVersionId) {
      historyActions.setNaming(false);
      setPending({ name: draft, fromVersionId, failed: false });
      working.current?.focus();
      void history.name(docId, draft, fromVersionId).then((named) => {
        setPending(
          named.ok ? null : { name: draft, fromVersionId, failed: true },
        );
      });
    },
  };
}

/**
 * Working, the focus target of naming; its name field while Working is named, once the list has `answered` and so
 * can offer the next draft's name; and the draft named and not yet answered.
 */
export function WorkingRow(props: {
  rows: readonly HistoryRow[];
  answered: boolean;
  draft: DraftNaming;
}): ReactNode {
  const { rows, draft } = props;
  const naming = useHistory("naming");
  const selected = useHistory("selected");
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
      {naming && draft.target === null && props.answered ? (
        <NameField
          initial={nextDraftName(rows)}
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
  return (
    <Row
      meta={DOCUMENT_WORDS.setBy(
        byUserId === userId ? YOU : nameOf(byUserId),
        formatTime(at),
        valueLabel(key, was, "row"),
      )}
    >
      {SETTINGS.get(key).label}
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
  const { now } = useEnvironment();
  const draftsOnly = useHistory("draftsOnly");
  const naming = useHistory("naming");
  const changes = useSettingChanges(docId);
  const drawnTo = useRef(0);
  const items = itemsOf(rows, changes, draftsOnly, now());
  useEffect(() => {
    if (drawnTo.current >= items.length - MORE_WITHIN_ROWS) props.onNearEnd();
  });
  const renderRow = (index: number): ReactNode => {
    drawnTo.current = Math.max(drawnTo.current, index);
    const item = items[index]!;
    if (item.kind === "setting") return <SettingRow change={item.change} />;
    if (item.kind === "day")
      return (
        <h4 className="px-2 pt-2 text-micro text-fg-muted uppercase">
          {item.label}
        </h4>
      );
    return (
      <VersionRow
        docId={docId}
        row={item.row}
        offline={props.offline}
        naming={
          naming && draft.target === item.row.item.id
            ? (item.row.item.name ?? nextDraftName(rows))
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
