// Preferences: one screen with no Save button. Every change applies at once, and the changes of this visit can be undone.
import { DEMO_PEOPLE } from "@manent/demo";
import { markEnd, markStart } from "@manent/perf";
import { SECTION_IDS } from "@manent/settings";
import type { SectionId, SettingKey, SettingsStore } from "@manent/settings";
import {
  Button,
  CommandButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  MessageSlot,
  PREFERENCES_WORDS,
  SEND_WORDS,
  SettingsProvider,
  createValue,
  useSubscribable,
} from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { deviceName as nameOfDevice } from "../../platform.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { readDeviceId } from "../../services/device-id.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { TEXT, pageTitle } from "../../text.ts";
import { useCustomShortcuts } from "./keyboard-pane.tsx";
import { PaneList } from "./pane-list.tsx";
import { Pane, paneKeys, paneLabels } from "./pane.tsx";
import { PreferencesSearch } from "./preferences-search.tsx";
import { isCommandId } from "./search-index.ts";
import { SetByYou } from "./set-by-you.tsx";
import { createVisit } from "./visit-undo.ts";
import type { Visit } from "./visit-undo.ts";

const route = getRouteApi("/preferences/$pane");

/** Every preference with a row here, in the order of the panes. */
const PREFERENCE_KEYS: readonly SettingKey[] = Object.freeze(
  SECTION_IDS.flatMap(paneKeys),
);
const DOCUMENT_PATH = /^\/s\/([^/?#]+)/;
const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([tabindex="-1"]), [tabindex="0"]';

/** The preferences that differ from their defaults, in the order of the panes, read again when any changes. */
function useModified(store: SettingsStore): readonly SettingKey[] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribers = PREFERENCE_KEYS.map((key) =>
        store.subscribe(key, listener),
      );
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
      };
    },
    [store],
  );
  const joined = useSyncExternalStore(subscribe, () =>
    PREFERENCE_KEYS.filter((key) => store.explain(key).modified).join(" "),
  );
  return useMemo(
    () => PREFERENCE_KEYS.filter((key) => joined.split(" ").includes(key)),
    [joined],
  );
}

/** The name of the place Back returns to: the document's title, or the Library. */
function usePlaceName(from: string): string {
  const { library } = useServices();
  const docId = DOCUMENT_PATH.exec(from)?.[1] ?? null;
  const title = useMemo(
    () =>
      docId === null
        ? createValue<string | null>(null)
        : library.documentTitle(docId),
    [library, docId],
  );
  return useSubscribable(title) ?? TEXT.libraryTitle;
}

/** This visit's changes, and Cmd/Ctrl+Z reaching them while the screen is open. */
function useVisit(deviceName: string | null): Visit {
  const services = useServices();
  const environment = useEnvironment();
  const visit = useMemo(
    () =>
      createVisit({
        services,
        deviceId: readDeviceId(environment.storage, environment.randomId),
        deviceName: deviceName ?? "",
        now: environment.now,
      }),
    [services, environment, deviceName],
  );
  useEffect(() => {
    const { visitUndo } = environment;
    visitUndo.current = visit.undo;
    return () => {
      if (visitUndo.current === visit.undo) visitUndo.current = null;
    };
  }, [environment, visit]);
  return visit;
}

/** The tab's title: Preferences, the pane shown, and the person. */
function useTabTitle(pane: SectionId): void {
  const { userId } = useServices();
  const { where } = useEnvironment();
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === userId);
    document.title = pageTitle(
      `${PREFERENCES_WORDS.title} — ${paneLabels(where.shell)[pane]}`,
      person?.name ?? null,
    );
  }, [userId, where, pane]);
}

/** Back to the place Preferences was opened from, and the screen's heading. */
function PreferencesHeader(props: { from: string }): ReactNode {
  const { from } = props;
  const navigate = useNavigate();
  const placeName = usePlaceName(from);
  return (
    <header className="flex h-titlebar shrink-0 items-center gap-2 border-b border-line px-2">
      <Button
        variant="ghost"
        className="text-fg-muted"
        onClick={() => void navigate({ href: from })}
      >
        {SEND_WORDS.back(placeName)}
      </Button>
      <h1 tabIndex={-1} className="truncate text-heading outline-none">
        {PREFERENCES_WORDS.title}
      </h1>
    </header>
  );
}

/** The column beside the pane: Search, Set by you while anything is, and the list of panes. */
function PreferencesColumn(props: {
  search: RefObject<HTMLInputElement | null>;
  /** Where Down arrow moves from the search field: the first control of what is shown. */
  results: RefObject<HTMLDivElement | null>;
  query: string;
  onQuery(query: string): void;
  count: number;
  onSetByYou(): void;
  pane: SectionId;
  onPane(pane: SectionId): void;
}): ReactNode {
  const { search, results, query, onQuery, count, onSetByYou, pane, onPane } =
    props;
  // focused on arrival, the field shows no ring until it is left and reached again
  const [arrival, setArrival] = useState(true);
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape" && event.currentTarget.value !== "") {
      event.preventDefault();
      onQuery("");
    } else if (event.key === "ArrowDown") {
      const first =
        results.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
      if (first === null) return;
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-line p-4 sm:w-panel-left sm:border-e sm:border-b-0 sm:px-2">
      <InputGroup data-arrival={arrival ? "" : undefined} className="h-control">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={search}
          type="search"
          aria-label={PREFERENCES_WORDS.search}
          placeholder={PREFERENCES_WORDS.search}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onSearchKey}
          onBlur={() => setArrival(false)}
        />
      </InputGroup>
      {count === 0 ? null : (
        <Button variant="ghost" className="justify-start" onClick={onSetByYou}>
          {PREFERENCES_WORDS.setByYouCount(count)}
        </Button>
      )}
      <PaneList pane={pane} onPane={onPane} />
    </div>
  );
}

/** What the screen shows beside the column: the search's results, Set by you, or the pane. */
function PreferencesBody(props: {
  query: string;
  setByYouOpen: boolean;
  pane: SectionId;
  modified: readonly SettingKey[];
  visit: Visit;
  deviceName: string | null;
}): ReactNode {
  const { query, setByYouOpen, pane, modified, visit, deviceName } = props;
  const { persisted } = useServices();
  if (query.trim() !== "")
    return (
      <PreferencesSearch
        query={query}
        deviceName={deviceName}
        persisted={persisted}
      />
    );
  if (setByYouOpen)
    return (
      <SetByYou
        modified={modified}
        deviceName={deviceName}
        persisted={persisted}
        onResetPreferences={visit.resetPreferences}
        onResetShortcuts={visit.resetShortcuts}
        onShortcuts={visit.setShortcuts}
      />
    );
  return (
    <Pane
      pane={pane}
      deviceName={deviceName}
      persisted={persisted}
      onShortcuts={visit.setShortcuts}
    />
  );
}

/** The status bar of Preferences: its messages, and the palette. */
function PreferencesStatusBar(): ReactNode {
  const { messages, commands } = useServices();
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-2 border-t border-line px-2"
    >
      <MessageSlot
        queue={messages}
        run={(id) => {
          if (isCommandId(id)) commands.run(id, "control");
        }}
        registered={isCommandId}
      />
      <CommandButton id="app.palette" size="sm" />
    </ShellRegion>
  );
}

export function PreferencesScreen(): ReactNode {
  const { pane: param }: { pane: string } = route.useParams();
  const { from }: { from: string } = route.useSearch();
  const pane: SectionId = SECTION_IDS.find((id) => id === param) ?? "writing";
  const services = useServices();
  const { where } = useEnvironment();
  const navigate = useNavigate();
  const deviceName = nameOfDevice(where);
  const [query, setQuery] = useState("");
  const [setByYouOpen, setSetByYouOpen] = useState(false);
  const [openedAt] = useState(markStart);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const visit = useVisit(deviceName);
  const modified = useModified(services.settings);
  const shortcutCount = useCustomShortcuts(services.keys).size;

  useLayoutEffect(() => {
    search.current?.focus();
    markEnd("ui.open.preferences", openedAt);
  }, [openedAt]);
  useEffect(() => services.lastPane.set(pane), [services, pane]);
  useTabTitle(pane);

  const showPane = (next: SectionId): void => {
    setSetByYouOpen(false);
    void navigate({
      href: `/preferences/${next}?from=${encodeURIComponent(from)}`,
    });
  };
  return (
    <SettingsProvider store={visit.store}>
      <div className="flex min-h-0 flex-1 flex-col">
        <PreferencesHeader from={from} />
        <div className="flex min-h-0 flex-1 flex-col overflow-auto sm:flex-row sm:overflow-hidden">
          <PreferencesColumn
            search={search}
            results={results}
            query={query}
            onQuery={setQuery}
            count={modified.length + shortcutCount}
            onSetByYou={() => setSetByYouOpen(true)}
            pane={pane}
            onPane={showPane}
          />
          <div ref={results} className="min-w-0 flex-1 p-6 sm:overflow-auto">
            <div className="max-w-content">
              <PreferencesBody
                query={query}
                setByYouOpen={setByYouOpen}
                pane={pane}
                modified={modified}
                visit={visit}
                deviceName={deviceName}
              />
            </div>
          </div>
        </div>
        <PreferencesStatusBar />
      </div>
    </SettingsProvider>
  );
}
