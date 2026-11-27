// The project's characters, sets and terms, each a list with counts, quick filter, inline rename/add and row menu.
import type { JsonMapView } from "@manent/crdt";
import { PROJECT_NAME_KINDS } from "@manent/revisions";
import type { ProjectNameKind } from "@manent/revisions";
import {
  Button,
  DropdownMenuItem,
  DropdownMenuSeparator,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  NAMES_WORDS,
  Row,
  Skeleton,
  formatCount,
  matchesQuery,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import {
  BookOpenIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
import { RowMenu } from "../screens/library/row-place.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { SettingsCard } from "../settings-shell/settings-card.tsx";
import { NameField } from "./name-field.tsx";
import { readNames } from "./names-entries.ts";
import type { NamesEntry } from "./names-entries.ts";

const QUICK_FILTER_THRESHOLD = 8;

const byName = (a: NamesEntry, b: NamesEntry): number =>
  a.name.localeCompare(b.name);

/** The project's index as the lists use it: its `names` map, and whether the person may only read it. */
interface OpenNames {
  map: JsonMapView;
  /** Not null once the server has said the person may only read the index. */
  readOnly: Subscribable<unknown>;
}

type NamesMapState =
  | { kind: "loading" }
  | { kind: "ready"; open: OpenNames }
  | { kind: "unavailable" };

/** The project's names, once its index has opened; loading until then, unavailable when it cannot open. */
function useNamesMap(projectId: string): NamesMapState {
  const { projectIndex } = useServices();
  const [state, setState] = useState<NamesMapState>({ kind: "loading" });
  useEffect(() => {
    const index = projectIndex(projectId);
    let open = true;
    Promise.all([index.map("names"), index.handle()]).then(
      ([names, handle]) => {
        if (open)
          setState({
            kind: "ready",
            open: { map: names, readOnly: handle.readOnly },
          });
      },
      // the person's sync could not start: the lists are not drawn
      () => {
        if (open) setState({ kind: "unavailable" });
      },
    );
    // the index stays open: the page of a document in the project holds the same session, which a close would end
    return () => {
      open = false;
      setState({ kind: "loading" });
    };
  }, [projectIndex, projectId]);
  return state;
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

function NameRow(props: {
  entry: NamesEntry;
  existingNames: readonly string[];
  map: JsonMapView;
  editable: boolean;
}): ReactNode {
  const { entry, existingNames, map, editable } = props;
  const [renaming, setRenaming] = useState(false);
  if (renaming)
    return (
      <div className="px-3 py-1.5">
        <NameField
          label={NAMES_WORDS.rename}
          placeholder={NAMES_WORDS.kinds[entry.kind].placeholder}
          initial={entry.name}
          existingNames={existingNames}
          onDone={(name) => {
            setRenaming(false);
            if (name !== null && name !== "" && name !== entry.name)
              map.set(entry.id, { kind: entry.kind, name });
          }}
        />
      </div>
    );
  if (!editable)
    return (
      <Row>
        <span className="truncate">{entry.name}</span>
      </Row>
    );
  return (
    <Row
      menuReveal="hover"
      menu={
        <RowMenu title={entry.name}>
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <PencilIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{NAMES_WORDS.rename}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => map.delete(entry.id)}
          >
            <Trash2Icon aria-hidden="true" className="size-icon shrink-0" />
            <span>{NAMES_WORDS.remove}</span>
          </DropdownMenuItem>
        </RowMenu>
      }
    >
      <span className="truncate">{entry.name}</span>
    </Row>
  );
}

/** One kind's list: its names by name, with count badge and inline add field. */
function NamesList(props: {
  kind: ProjectNameKind;
  entries: readonly NamesEntry[];
  allKindNames: readonly string[];
  map: JsonMapView;
  editable: boolean;
}): ReactNode {
  const { kind, entries, allKindNames, map, editable } = props;
  const words = NAMES_WORDS.kinds[kind];
  const { randomId } = useEnvironment();
  const [adding, setAdding] = useState(false);
  const titleWithCount =
    allKindNames.length > 0
      ? `${words.heading} (${formatCount(allKindNames.length)})`
      : words.heading;
  return (
    <SettingsCard asSection aria-label={words.heading} title={titleWithCount}>
      <div className="flex flex-col gap-2">
        {entries.length === 0 ? null : (
          <div className="-mx-3 divide-y divide-line">
            {entries.toSorted(byName).map((entry) => (
              <NameRow
                key={entry.id}
                entry={entry}
                existingNames={allKindNames}
                map={map}
                editable={editable}
              />
            ))}
          </div>
        )}
        {editable ? (
          <div>
            {adding ? (
              <NameField
                label={words.add}
                placeholder={words.placeholder}
                initial=""
                existingNames={allKindNames}
                keepOpenAfterSave
                onDone={(name) => {
                  if (name === null) setAdding(false);
                  else if (name !== "") map.set(randomId(), { kind, name });
                }}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdding(true)}
              >
                {words.add}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}

function NamesListsSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 py-1">
      {PROJECT_NAME_KINDS.map((kind) => (
        <div key={kind} aria-hidden="true" className="flex flex-col gap-1.5">
          <Skeleton className="my-1.5 h-3.5 w-20" />
          <Skeleton className="h-row w-full" />
          <Skeleton className="h-row w-3/4" />
        </div>
      ))}
    </div>
  );
}

/**
 * The three lists of the project `projectId`, with one line saying what they are for while all are empty; read only,
 * without their adds, renames and removes, once the server has said the person may only read them.
 */
export function NamesLists(props: { projectId: string }): ReactNode {
  const state = useNamesMap(props.projectId);
  if (state.kind === "unavailable") return null;
  if (state.kind === "loading") return <NamesListsSkeleton />;
  return <OpenLists open={state.open} />;
}

function OpenLists(props: { open: OpenNames }): ReactNode {
  const { map, readOnly } = props.open;
  const entries = useEntries(map);
  const editable = useSubscribable(readOnly) === null;
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);

  const visibleEntries = useMemo(
    () =>
      filter === ""
        ? entries
        : entries.filter((entry) => matchesQuery(filter, [entry.name])),
    [entries, filter],
  );

  if (entries.length === 0 && !editable) {
    return (
      <EmptyHeroCard
        compact
        icon={<BookOpenIcon aria-hidden="true" className="size-4" />}
        description={NAMES_WORDS.empty}
      />
    );
  }
  const showFilter = entries.length >= QUICK_FILTER_THRESHOLD || filter !== "";
  const noMatches = filter !== "" && visibleEntries.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 ? (
        <p className="text-ui text-fg-muted">{NAMES_WORDS.empty}</p>
      ) : null}
      {showFilter ? (
        <InputGroup className="h-control">
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden="true" className="size-icon" />
          </InputGroupAddon>
          <InputGroupInput
            ref={filterRef}
            type="search"
            aria-label={NAMES_WORDS.filterPlaceholder}
            placeholder={NAMES_WORDS.filterPlaceholder}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || filter === "") return;
              event.preventDefault();
              setFilter("");
            }}
          />
          {filter === "" ? null : (
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={NAMES_WORDS.clearFilter}
                className="size-6 cursor-pointer text-fg-muted hover:text-fg"
                onClick={() => {
                  setFilter("");
                  filterRef.current?.focus();
                }}
              >
                <XIcon aria-hidden="true" className="size-3.5" />
              </Button>
            </InputGroupAddon>
          )}
        </InputGroup>
      ) : null}
      {noMatches ? (
        <EmptyHeroCard
          compact
          icon={<BookOpenIcon aria-hidden="true" className="size-4" />}
          description={NAMES_WORDS.noMatches}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFilter("");
                filterRef.current?.focus();
              }}
            >
              {NAMES_WORDS.clearFilter}
            </Button>
          }
        />
      ) : (
        PROJECT_NAME_KINDS.map((kind) => {
          const allOfKind = entries.filter((entry) => entry.kind === kind);
          const matchingOfKind = visibleEntries.filter(
            (entry) => entry.kind === kind,
          );
          if (filter !== "" && matchingOfKind.length === 0) return null;
          return (
            <NamesList
              key={kind}
              kind={kind}
              entries={matchingOfKind}
              allKindNames={allOfKind.map((entry) => entry.name)}
              map={map}
              editable={editable}
            />
          );
        })
      )}
    </div>
  );
}
