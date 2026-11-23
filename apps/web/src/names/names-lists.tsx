// The project's characters, sets and terms, each a list that adds, renames and removes its names in place.
import type { JsonMapView } from "@manent/crdt";
import { PROJECT_NAME_KINDS } from "@manent/revisions";
import type { ProjectNameKind } from "@manent/revisions";
import { Button, DropdownMenuItem, Input, NAMES_WORDS, Row } from "@manent/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { RowMenu } from "../screens/library/row-place.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { readNames } from "./names-entries.ts";
import type { NamesEntry } from "./names-entries.ts";

const byName = (a: NamesEntry, b: NamesEntry): number =>
  a.name.localeCompare(b.name);

/** The project's `names` map, once its index has opened; null until then, and when it cannot open. */
function useNamesMap(projectId: string): JsonMapView | null {
  const { projectIndex } = useServices();
  const [map, setMap] = useState<JsonMapView | null>(null);
  useEffect(() => {
    const index = projectIndex(projectId);
    let open = true;
    index.map("names").then(
      (names) => {
        if (open) setMap(names);
      },
      // the person's sync could not start: the lists are not drawn
      () => {},
    );
    return () => {
      open = false;
      setMap(null);
      void index.close();
    };
  }, [projectIndex, projectId]);
  return map;
}

/** The entries of `map`, read again when it changes. */
function useEntries(map: JsonMapView): readonly NamesEntry[] {
  const read = useRef<{ keys: string; entries: readonly NamesEntry[] }>({
    keys: "",
    entries: [],
  });
  const snapshot = useCallback((): readonly NamesEntry[] => {
    const entries = readNames(map);
    const keys = JSON.stringify(entries);
    // the same entries are the same array, so the lists draw only when a name changed
    if (keys !== read.current.keys) read.current = { keys, entries };
    return read.current.entries;
  }, [map]);
  const subscribe = useCallback(
    (listener: () => void) => map.subscribe(listener),
    [map],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** A name typed in place: Enter gives the name, trimmed; Escape, or leaving it, gives null. */
function NameField(props: {
  label: string;
  placeholder: string;
  initial: string;
  onDone(name: string | null): void;
}): ReactNode {
  const { label, placeholder, initial, onDone } = props;
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onDone(null);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    onDone(value.trim());
    setValue("");
  };
  return (
    <Input
      ref={input}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onDone(null)}
    />
  );
}

function NameRow(props: { entry: NamesEntry; map: JsonMapView }): ReactNode {
  const { entry, map } = props;
  const [renaming, setRenaming] = useState(false);
  if (renaming)
    return (
      <NameField
        label={NAMES_WORDS.rename}
        placeholder={NAMES_WORDS.kinds[entry.kind].placeholder}
        initial={entry.name}
        onDone={(name) => {
          setRenaming(false);
          if (name !== null && name !== "" && name !== entry.name)
            map.set(entry.id, { kind: entry.kind, name });
        }}
      />
    );
  return (
    <Row
      trailing={[
        <RowMenu title={entry.name}>
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            {NAMES_WORDS.rename}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => map.delete(entry.id)}>
            {NAMES_WORDS.remove}
          </DropdownMenuItem>
        </RowMenu>,
      ]}
    >
      <span className="truncate">{entry.name}</span>
    </Row>
  );
}

/** One kind's list: its names by name, then the field that adds one, which stays open for the next until left. */
function NamesList(props: {
  kind: ProjectNameKind;
  entries: readonly NamesEntry[];
  map: JsonMapView;
}): ReactNode {
  const { kind, entries, map } = props;
  const words = NAMES_WORDS.kinds[kind];
  const { randomId } = useEnvironment();
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={words.heading} className="flex flex-col">
      <h3 className="mn-group-label px-0!">{words.heading}</h3>
      {entries.toSorted(byName).map((entry) => (
        <NameRow key={entry.id} entry={entry} map={map} />
      ))}
      <div className="pt-1">
        {adding ? (
          <NameField
            label={words.add}
            placeholder={words.placeholder}
            initial=""
            onDone={(name) => {
              if (name === null) setAdding(false);
              else if (name !== "") map.set(randomId(), { kind, name });
            }}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            {words.add}
          </Button>
        )}
      </div>
    </section>
  );
}

/** The three lists of the project `projectId`, with one line saying what they are for while all are empty. */
export function NamesLists(props: { projectId: string }): ReactNode {
  const map = useNamesMap(props.projectId);
  return map === null ? null : <OpenLists map={map} />;
}

function OpenLists(props: { map: JsonMapView }): ReactNode {
  const { map } = props;
  const entries = useEntries(map);
  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 ? (
        <p className="text-ui text-fg-muted">{NAMES_WORDS.empty}</p>
      ) : null}
      {PROJECT_NAME_KINDS.map((kind) => (
        <NamesList
          key={kind}
          kind={kind}
          entries={entries.filter((entry) => entry.kind === kind)}
          map={map}
        />
      ))}
    </div>
  );
}
