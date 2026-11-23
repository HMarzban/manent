// The project's characters, sets and terms, each a list that adds, renames and removes its names in place.
import type { JsonMapView } from "@manent/crdt";
import { PROJECT_NAME_KINDS } from "@manent/revisions";
import type { ProjectNameKind } from "@manent/revisions";
import {
  Button,
  DropdownMenuItem,
  Input,
  NAMES_WORDS,
  Row,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
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

/** The project's index as the lists use it: its `names` map, and whether the person may only read it. */
interface OpenNames {
  map: JsonMapView;
  /** Not null once the server has said the person may only read the index. */
  readOnly: Subscribable<unknown>;
}

/** The project's names, once its index has opened; null until then, and when it cannot open. */
function useNamesMap(projectId: string): OpenNames | null {
  const { projectIndex } = useServices();
  const [map, setMap] = useState<OpenNames | null>(null);
  useEffect(() => {
    const index = projectIndex(projectId);
    let open = true;
    Promise.all([index.map("names"), index.handle()]).then(
      ([names, handle]) => {
        if (open) setMap({ map: names, readOnly: handle.readOnly });
      },
      // the person's sync could not start: the lists are not drawn
      () => {},
    );
    // the index stays open: the page of a document in the project holds the same session, which a close would end
    return () => {
      open = false;
      setMap(null);
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

function NameRow(props: {
  entry: NamesEntry;
  map: JsonMapView;
  editable: boolean;
}): ReactNode {
  const { entry, map, editable } = props;
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
  if (!editable)
    return (
      <Row>
        <span className="truncate">{entry.name}</span>
      </Row>
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
  editable: boolean;
}): ReactNode {
  const { kind, entries, map, editable } = props;
  const words = NAMES_WORDS.kinds[kind];
  const { randomId } = useEnvironment();
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={words.heading} className="flex flex-col">
      <h3 className="mn-group-label px-0!">{words.heading}</h3>
      {entries.toSorted(byName).map((entry) => (
        <NameRow key={entry.id} entry={entry} map={map} editable={editable} />
      ))}
      {editable ? (
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
      ) : null}
    </section>
  );
}

/**
 * The three lists of the project `projectId`, with one line saying what they are for while all are empty; read only,
 * without their adds, renames and removes, once the server has said the person may only read them.
 */
export function NamesLists(props: { projectId: string }): ReactNode {
  const open = useNamesMap(props.projectId);
  return open === null ? null : <OpenLists open={open} />;
}

function OpenLists(props: { open: OpenNames }): ReactNode {
  const { map, readOnly } = props.open;
  const entries = useEntries(map);
  const editable = useSubscribable(readOnly) === null;
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
          editable={editable}
        />
      ))}
    </div>
  );
}
