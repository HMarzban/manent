// Preferences: one screen with no Save button. Every change applies at once, and the changes of this visit can be undone.
import { DEMO_PEOPLE } from "@manent/demo";
import { markEnd, markStart } from "@manent/perf";
import { SECTION_IDS } from "@manent/settings";
import type { SectionId, SettingKey, SettingsStore } from "@manent/settings";
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  PREFERENCES_WORDS,
  Row,
  SEND_WORDS,
  SettingsProvider,
  formatCount,
  useSubscribable,
} from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  GlobeIcon,
  KeyboardIcon,
  MonitorIcon,
  PaletteIcon,
  PenLineIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Undo2Icon,
  UserIcon,
} from "lucide-react";
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
import { SettingsShell } from "../../settings-shell/settings-shell.tsx";
import type { SettingsNavItem } from "../../settings-shell/settings-shell.tsx";
import { usePlaceName } from "../../settings-shell/use-place-name.ts";
import { pageTitle } from "../../text.ts";
import { useCustomShortcuts } from "./keyboard-pane.tsx";
import { Pane, paneKeys, paneLabels } from "./pane.tsx";
import { PreferencesSearch } from "./preferences-search.tsx";
import { SetByYou } from "./set-by-you.tsx";
import { createVisit } from "./visit-undo.ts";
import type { Visit } from "./visit-undo.ts";

const route = getRouteApi("/preferences/$pane");

/** Every preference with a row here, in the order of the panes. */
const PREFERENCE_KEYS: readonly SettingKey[] = Object.freeze(
  SECTION_IDS.flatMap(paneKeys),
);
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

function paneIcon(pane: SectionId, desktop: boolean): ReactNode {
  switch (pane) {
    case "writing":
      return <PenLineIcon aria-hidden="true" />;
    case "appearance":
      return <PaletteIcon aria-hidden="true" />;
    case "keyboard":
      return <KeyboardIcon aria-hidden="true" />;
    case "account":
      return <UserIcon aria-hidden="true" />;
    case "device":
      return desktop ? (
        <MonitorIcon aria-hidden="true" />
      ) : (
        <GlobeIcon aria-hidden="true" />
      );
  }
}

/** Search field and Set by you filter row at the top of the Preferences rail. */
function PreferencesRailTop(props: {
  search: RefObject<HTMLInputElement | null>;
  results: RefObject<HTMLElement | null>;
  query: string;
  onQuery(query: string): void;
  count: number;
  setByYouOpen: boolean;
  onSetByYou(): void;
}): ReactNode {
  const { search, results, query, onQuery, count, setByYouOpen, onSetByYou } =
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
    <>
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
        <button
          type="button"
          aria-pressed={setByYouOpen}
          className="block w-full cursor-pointer rounded-control text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSetByYou}
        >
          <Row
            current={setByYouOpen}
            leading={<SlidersHorizontalIcon aria-hidden="true" />}
            trailing={[
              <span key="count" className="mn-tag tabular-nums">
                {formatCount(count)}
              </span>,
            ]}
          >
            {PREFERENCES_WORDS.setByYouLabel}
            <span className="sr-only">{" · "}</span>
          </Row>
        </button>
      )}
    </>
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
  onOpenWorkspace(workspaceId: string): void;
}): ReactNode {
  const {
    query,
    setByYouOpen,
    pane,
    modified,
    visit,
    deviceName,
    onOpenWorkspace,
  } = props;
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
      onResetShortcuts={visit.resetShortcuts}
      onOpenWorkspace={onOpenWorkspace}
    />
  );
}

export function PreferencesScreen(): ReactNode {
  const { pane: param }: { pane: string } = route.useParams();
  const { from }: { from: string } = route.useSearch();
  const pane: SectionId = SECTION_IDS.find((id) => id === param) ?? "writing";
  const services = useServices();
  const { where } = useEnvironment();
  const navigate = useNavigate();
  const placeName = usePlaceName(from);
  const deviceName = nameOfDevice(where);
  const [query, setQuery] = useState("");
  const [setByYouOpen, setSetByYouOpen] = useState(false);
  const [openedAt] = useState(markStart);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLElement>(null);
  const visit = useVisit(deviceName);
  const undoCount = useSubscribable(visit.undo.count);
  const modified = useModified(services.settings);
  const shortcutCount = useCustomShortcuts(services.keys).size;

  useLayoutEffect(() => {
    search.current?.focus();
    markEnd("ui.open.preferences", openedAt);
  }, [openedAt]);
  useEffect(() => services.lastPane.set(pane), [services, pane]);
  useTabTitle(pane);

  const labels = paneLabels(where.shell);
  const desktop = where.shell === "desktop";
  const modifiedSet = useMemo(() => new Set(modified), [modified]);
  const navItems: readonly SettingsNavItem<SectionId>[] = useMemo(
    () =>
      SECTION_IDS.map((id) => {
        const hasChanges =
          id === "keyboard"
            ? shortcutCount > 0
            : paneKeys(id).some((key) => modifiedSet.has(key));
        return {
          id,
          label: labels[id],
          icon: paneIcon(id, desktop),
          trailing: hasChanges ? (
            <span aria-hidden="true" className="mn-setting-dot" />
          ) : undefined,
          separatedBefore: id === "device",
        };
      }),
    [labels, desktop, modifiedSet, shortcutCount],
  );

  const showPane = (next: SectionId): void => {
    setSetByYouOpen(false);
    setQuery("");
    void navigate({
      href: `/preferences/${next}?from=${encodeURIComponent(from)}`,
    });
  };

  const openWorkspaceSettings = (workspaceId: string): void => {
    void navigate({
      href: `/w/${encodeURIComponent(workspaceId)}/settings/people?from=${encodeURIComponent(`/preferences/account?from=${encodeURIComponent(from)}`)}`,
    });
  };

  // Passing null while Set by you or Search is active lets clicking the previously selected tab return to it immediately.
  const activeNavId: SectionId | null =
    setByYouOpen || query.trim() !== "" ? null : pane;
  const undoHint = where.platform === "mac" ? "⌘Z" : "Ctrl+Z";

  return (
    <SettingsProvider store={visit.store}>
      <SettingsShell
        backLabel={SEND_WORDS.back(placeName)}
        backTitle={placeName}
        onBack={() => void navigate({ href: from })}
        title={PREFERENCES_WORDS.title}
        headerAction={
          undoCount === 0 ? null : (
            <Button
              variant="outline"
              size="sm"
              title={PREFERENCES_WORDS.undoVisitTitle(undoHint)}
              onClick={() => {
                visit.undo.undo();
              }}
            >
              <Undo2Icon aria-hidden="true" />
              {undoCount === 1
                ? PREFERENCES_WORDS.undoVisit
                : PREFERENCES_WORDS.undoVisitCount(undoCount)}
            </Button>
          )
        }
        navLabel={PREFERENCES_WORDS.title}
        navMode="tabs"
        navItems={navItems}
        activeNavId={activeNavId}
        onSelectNav={showPane}
        mainRef={results}
        railTop={
          <PreferencesRailTop
            search={search}
            results={results}
            query={query}
            onQuery={setQuery}
            count={modified.length + shortcutCount}
            setByYouOpen={setByYouOpen}
            onSetByYou={() => {
              setQuery("");
              setSetByYouOpen(true);
            }}
          />
        }
      >
        <PreferencesBody
          query={query}
          setByYouOpen={setByYouOpen}
          pane={pane}
          modified={modified}
          visit={visit}
          deviceName={deviceName}
          onOpenWorkspace={openWorkspaceSettings}
        />
      </SettingsShell>
    </SettingsProvider>
  );
}
