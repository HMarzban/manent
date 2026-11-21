// The rows of the History tab: Working, then the versions under their days, or with Drafts only the drafts oldest
// first, ending in Working; the name field of Name this draft…, and a draft named and not yet answered.
import {
  Button,
  DOCUMENT_WORDS,
  HISTORY_WORDS,
  Input,
  Row,
  VirtualRows,
  formatTime,
  joinNames,
} from "@manent/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { baselineOfRow } from "../../history/baseline.ts";
import { isTitledByTime } from "../../history/history-rows.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { selectRow } from "../../history/history-view.ts";
import { ROW_EXTENSIONS } from "../../history/row-extensions.ts";
import { useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { historyActions, useHistory } from "../../state/history.store.ts";
import { HistoryRowMenu } from "./history-row-menu.tsx";

// the next page is asked for while a row this close to the end is drawn
const MORE_WITHIN_ROWS = 50;
// the person, in the Working row, when they made the last change
const YOU = "you";

type Item =
  | { kind: "working" }
  | { kind: "day"; label: string }
  | { kind: "version"; row: HistoryRow };

interface Pending {
  name: string;
  fromVersionId: string | null;
  failed: boolean;
}

/** The first letter of the first two words of `name`: "Dana Reyes" is "DR". */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");

/** Working, then each day's versions under its day; with Drafts only the drafts oldest first, then Working. */
function itemsOf(rows: readonly HistoryRow[], draftsOnly: boolean): Item[] {
  if (draftsOnly)
    return [
      ...rows
        .filter((row) => row.item.kind === "named")
        .toReversed()
        .map((row): Item => ({ kind: "version", row })),
      { kind: "working" },
    ];
  const items: Item[] = [{ kind: "working" }];
  let day: string | null = null;
  for (const row of rows) {
    if (row.day !== day) items.push({ kind: "day", label: row.day });
    day = row.day;
    items.push({ kind: "version", row });
  }
  return items;
}

/** The name Name this draft… offers: First draft … Tenth draft, then Draft 11, Draft 12 …, after the script's drafts. */
function nextDraftName(rows: readonly HistoryRow[]): string {
  const n = rows.filter((row) => row.item.kind === "named").length + 1;
  return HISTORY_WORDS.ordinals[n - 1] ?? HISTORY_WORDS.draftNumber(n);
}

/** Enter names, Escape cancels; the field keeps every other key from the list around it. */
function NameField(props: {
  initial: string;
  onName(name: string): void;
  onCancel(): void;
}): ReactNode {
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(props.initial);
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const onKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === "Escape") props.onCancel();
    if (event.key !== "Enter") return;
    event.preventDefault();
    const name = value.trim();
    if (name !== "") props.onName(name);
  };
  return (
    <Input
      ref={field}
      aria-label={HISTORY_WORDS.nameField}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      className="mx-2 mb-1 h-control w-auto text-ui"
    />
  );
}

/** The avatars of the people whose changes the version holds, named together for a screen reader. */
function Avatars(props: { userIds: readonly string[] }): ReactNode {
  const names = props.userIds.map(nameOf);
  if (names.length === 0) return null;
  return (
    <span role="img" aria-label={joinNames(names)} className="flex gap-0.5">
      {names.map((name, index) => (
        <span
          key={props.userIds[index]}
          aria-hidden="true"
          className="rounded-full bg-surface-2 px-1 text-micro"
        >
          {initialsOf(name)}
        </span>
      ))}
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
}): ReactNode {
  const { docId, row } = props;
  const meta = metaOf(docId, row);
  const authors = row.item.summary?.authorUserIds ?? [];
  const selected = useHistory("selected") === row.item.id;
  const named = row.item.kind === "named";
  // Enter opens the version as it was; a click only selects it
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
            leading={named ? <span aria-hidden="true">★</span> : undefined}
            meta={meta === null ? undefined : meta}
            trailing={[
              ...(authors.length === 0
                ? []
                : [<Avatars key="avatars" userIds={authors} />]),
              ...(row.local === null ? [] : [HISTORY_WORDS.onDevice]),
              ...(handle === null ? [] : [handle]),
            ]}
            onActivate={() => selectRow(row)}
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

export function VersionRows(props: {
  docId: string;
  rows: readonly HistoryRow[];
  offline: boolean;
  onNearEnd(): void;
}): ReactNode {
  const { docId, rows } = props;
  const { history, userId } = useServices();
  const draftsOnly = useHistory("draftsOnly");
  const naming = useHistory("naming");
  const selected = useHistory("selected");
  // the version the row menu's Name this draft… names; null: Working
  const [target, setTarget] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const working = useRef<HTMLElement>(null);
  const drawnTo = useRef(0);
  const items = itemsOf(rows, draftsOnly);
  useEffect(() => {
    if (drawnTo.current >= items.length - MORE_WITHIN_ROWS) props.onNearEnd();
  });
  useEffect(() => {
    if (!naming) setTarget(null);
  }, [naming]);

  const name = (draft: string, fromVersionId: string | null): void => {
    historyActions.setNaming(false);
    setPending({ name: draft, fromVersionId, failed: false });
    working.current?.focus();
    void history.name(docId, draft, fromVersionId).then((named) => {
      setPending(
        named.ok ? null : { name: draft, fromVersionId, failed: true },
      );
    });
  };
  // the newest version stands for the last change: who made it and when
  const newest = rows[0]?.item ?? null;
  const workingRow = (
    <>
      {newest === null ? null : (
        <Row
          rowRef={working}
          selected={selected === null}
          onActivate={() => historyActions.select(null)}
        >
          {HISTORY_WORDS.working(
            newest.createdByUserId === userId
              ? YOU
              : nameOf(newest.createdByUserId),
            formatTime(newest.createdAt),
          )}
        </Row>
      )}
      {naming && target === null ? (
        <NameField
          initial={nextDraftName(rows)}
          onName={(draft) => name(draft, null)}
          onCancel={() => historyActions.setNaming(false)}
        />
      ) : null}
      {pending === null ? null : (
        <div>
          <Row
            leading={<span aria-hidden="true">★</span>}
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
                onClick={() => name(pending.name, pending.fromVersionId)}
              >
                {HISTORY_WORDS.tryAgain}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
  const renderRow = (index: number): ReactNode => {
    drawnTo.current = Math.max(drawnTo.current, index);
    const item = items[index]!;
    if (item.kind === "working") return workingRow;
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
          naming && target === item.row.item.id
            ? (item.row.item.name ?? nextDraftName(rows))
            : null
        }
        onName={() => {
          setTarget(item.row.item.id);
          historyActions.setNaming(true);
        }}
        name={(draft) => name(draft, item.row.item.id)}
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
