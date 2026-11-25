// A draft's name: the one Name this draft… offers, and the field it is typed in.
import { HISTORY_WORDS, Input } from "@manent/ui";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { HistoryRow } from "../../history/history-rows.ts";
import { ladderInUse, proposeDraftName } from "../../project/ladder.ts";
import { useServices } from "../../services/context.tsx";

const NO_LADDER: readonly string[] = Object.freeze([]);
const NO_SUBSCRIBE = (): (() => void) => () => {};

/** Subscribes to the draft ladder active for `docId`. */
export function useDraftLadder(docId: string | undefined): readonly string[] {
  const { openScriptStore } = useServices();
  const store = docId === undefined ? null : openScriptStore(docId);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (store === null) return NO_SUBSCRIBE();
      const stopLadder = store.subscribe("project.ladder", listener);
      const stopTemplate = store.subscribe("project.template", listener);
      return () => {
        stopLadder();
        stopTemplate();
      };
    },
    [store],
  );
  return useSyncExternalStore(subscribe, () =>
    store === null ? NO_LADDER : ladderInUse(store),
  );
}

/** The name Name this draft… offers after the script's drafts among `rows`, on the draft ladder `ladder` (none unless given). */
export function nextDraftName(
  rows: readonly HistoryRow[],
  ladder: readonly string[] = [],
): string {
  const names = rows.flatMap(({ item }) =>
    (item.kind === "named" || item.kind === "sent") && item.name !== null
      ? [item.name]
      : [],
  );
  return proposeDraftName(names, ladder);
}

/** Enter names, Escape cancels; the field keeps every other key from the list around it. */
export function NameField(props: {
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
