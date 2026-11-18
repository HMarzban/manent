// Preferences: one screen with no Save button. Every change applies at once, and the changes of this visit can be undone.
import { DEMO_PEOPLE } from "@manent/demo";
import { markEnd, markStart } from "@manent/perf";
import { SECTION_IDS, SETTINGS, UNSET, entryKey } from "@manent/settings";
import type {
  ResetReceipt,
  SectionId,
  SettingKey,
  SettingsStore,
} from "@manent/settings";
import {
  Button,
  CommandButton,
  Input,
  MessageSlot,
  PREFERENCES_WORDS,
  SEND_WORDS,
  SettingsProvider,
  createValue,
  messageFor,
  useSubscribable,
} from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { deviceName as nameOfDevice } from "../../platform.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { readDeviceId } from "../../services/device-id.ts";
import type { PersonServices } from "../../services/ports.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { TEXT, pageTitle } from "../../text.ts";
import { readCustomShortcuts, useCustomShortcuts } from "./keyboard-pane.tsx";
import type { ShortcutChange } from "./keyboard-pane.tsx";
import { PaneList } from "./pane-list.tsx";
import { Pane, paneKeys, paneLabels } from "./pane.tsx";
import { PreferencesSearch } from "./preferences-search.tsx";
import { isCommandId } from "./search-index.ts";
import { SetByYou } from "./set-by-you.tsx";
import { createVisitUndo } from "./visit-undo.ts";
import type { VisitUndo } from "./visit-undo.ts";

const route = getRouteApi("/preferences/$pane");

/** Every preference with a row here, in the order of the panes. */
const PREFERENCE_KEYS: readonly SettingKey[] = Object.freeze(
  SECTION_IDS.flatMap(paneKeys),
);
const DOCUMENT_PATH = /^\/s\/([^/?#]+)/;
const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([tabindex="-1"]), [tabindex="0"]';

const isSettingKey = (key: string): key is SettingKey =>
  SETTINGS.all.some((def) => def.key === key);

const isReceipt = (value: unknown): value is ResetReceipt =>
  typeof value === "object" &&
  value !== null &&
  "entries" in value &&
  Array.isArray(value.entries) &&
  value.entries.every(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      "key" in entry &&
      typeof entry.key === "string",
  );

const isShortcutChanges = (value: unknown): value is ShortcutChange[] =>
  Array.isArray(value) &&
  value.every(
    (change: unknown) =>
      typeof change === "object" &&
      change !== null &&
      "commandId" in change &&
      typeof change.commandId === "string" &&
      "keys" in change,
  );

/** Writes what a control or an undo gives, once the setting's own type accepts it. */
function setFrom(store: SettingsStore, key: SettingKey, input: unknown): void {
  const parsed = SETTINGS.get(key).type.parse(input);
  if (parsed.ok) store.set(key, parsed.value);
}

/** The value `key` holds of its own, or UNSET while it has none. */
function ownValue(store: SettingsStore, key: SettingKey): unknown {
  const explained = store.explain(key);
  return explained.source === "own" ? explained.value : UNSET;
}

/** The changes of one visit: each is recorded, and a reset is also offered back in the message slot. */
interface Visit {
  undo: VisitUndo;
  /** The person's store, recording each change and row reset made through it. */
  store: SettingsStore;
  setShortcuts(changes: readonly ShortcutChange[]): void;
  resetPreferences(): void;
  resetShortcuts(): void;
}

function createVisit(options: {
  services: PersonServices;
  deviceId: string;
  deviceName: string;
  now: () => number;
}): Visit {
  const { services, deviceId, deviceName, now } = options;
  const { settings, keys, messages, reverses } = services;
  const writeShortcuts = (changes: readonly ShortcutChange[]): void => {
    for (const { commandId, keys: kept } of changes)
      keys.set(entryKey(commandId, deviceId), {
        v: kept,
        at: now(),
        on: deviceName,
        unset: kept === null,
      });
  };
  const putBackSettings = (receipt: ResetReceipt): void => {
    for (const { key, was } of receipt.entries) {
      if (!isSettingKey(key)) continue;
      if (was === UNSET) settings.reset(key);
      else setFrom(settings, key, was);
    }
  };
  const undo = createVisitUndo({
    putBack(key, was) {
      if (key === "shortcuts") {
        if (isShortcutChanges(was)) writeShortcuts(was);
      } else if (isReceipt(was)) putBackSettings(was);
    },
  });
  const offerBack = (count: number, reverse: () => void): void => {
    const message = messageFor({ kind: "preferences_reset", count });
    reverses.set(message.id, reverse);
    messages.push(message);
  };
  /** The keys each changed command holds of its own before `changes`, null for its defaults. */
  const before = (changes: readonly ShortcutChange[]): ShortcutChange[] => {
    const custom = readCustomShortcuts(keys);
    return changes.map(({ commandId }) => ({
      commandId,
      keys: custom.get(commandId)?.keys ?? null,
    }));
  };
  const store: SettingsStore = {
    get: (key) => settings.get(key),
    explain: (key) => settings.explain(key),
    set(key, value) {
      const was = ownValue(settings, key);
      const result = settings.set(key, value);
      if (result.ok) undo.record(key, { entries: [{ key, was }] });
      return result;
    },
    hold: (key) => settings.hold(key),
    reset(target) {
      const receipt = settings.reset(target);
      // a scope's reset is recorded by resetPreferences, as one change with the other scope it resets
      if (typeof target === "string" && receipt.entries.length > 0)
        undo.record(target, receipt);
      return receipt;
    },
    restore: (receipt) => settings.restore(receipt),
    subscribe: (key, listener) => settings.subscribe(key, listener),
    modified: (scope) => settings.modified(scope),
  };
  return {
    undo,
    store,
    setShortcuts(changes) {
      undo.record("shortcuts", before(changes));
      writeShortcuts(changes);
    },
    resetPreferences() {
      const receipt: ResetReceipt = {
        entries: [
          ...settings.reset({ scope: "personal" }).entries,
          ...settings.reset({ scope: "device" }).entries,
        ],
      };
      const first = receipt.entries.map((e) => e.key).find(isSettingKey);
      if (first === undefined) return;
      undo.record(first, receipt);
      offerBack(receipt.entries.length, () => settings.restore(receipt));
    },
    resetShortcuts() {
      const changes = [...readCustomShortcuts(keys).keys()].map(
        (commandId): ShortcutChange => ({ commandId, keys: null }),
      );
      if (changes.length === 0) return;
      const was = before(changes);
      undo.record("shortcuts", was);
      writeShortcuts(changes);
      // the shortcuts are one preference, however many of them were set
      offerBack(1, () => writeShortcuts(was));
    },
  };
}

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

export function PreferencesScreen(): ReactNode {
  const { pane: param }: { pane: string } = route.useParams();
  const { from }: { from: string } = route.useSearch();
  const pane: SectionId = SECTION_IDS.find((id) => id === param) ?? "writing";
  const services = useServices();
  const environment = useEnvironment();
  const { where } = environment;
  const navigate = useNavigate();
  const deviceName = nameOfDevice(where);
  const [query, setQuery] = useState("");
  const [setByYouOpen, setSetByYouOpen] = useState(false);
  const [openedAt] = useState(markStart);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
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
  const modified = useModified(services.settings);
  const shortcutCount = useCustomShortcuts(services.keys).size;
  const placeName = usePlaceName(from);

  useLayoutEffect(() => {
    search.current?.focus();
    markEnd("ui.open.preferences", openedAt);
  }, [openedAt]);
  useEffect(() => services.lastPane.set(pane), [services, pane]);
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === services.userId);
    document.title = pageTitle(
      `${PREFERENCES_WORDS.title} — ${paneLabels(where.shell)[pane]}`,
      person?.name ?? null,
    );
  }, [services, where, pane]);
  useEffect(() => {
    const { visitUndo } = environment;
    visitUndo.current = visit.undo;
    return () => {
      if (visitUndo.current === visit.undo) visitUndo.current = null;
    };
  }, [environment, visit]);

  const showPane = (next: SectionId): void => {
    setSetByYouOpen(false);
    void navigate({
      href: `/preferences/${next}?from=${encodeURIComponent(from)}`,
    });
  };
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape" && event.currentTarget.value !== "") {
      event.preventDefault();
      setQuery("");
    } else if (event.key === "ArrowDown") {
      const first =
        results.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
      if (first === null) return;
      event.preventDefault();
      first.focus();
    }
  };
  const count = modified.length + shortcutCount;
  const searching = query.trim() !== "";
  const body = searching ? (
    <PreferencesSearch
      query={query}
      deviceName={deviceName}
      persisted={services.persisted}
    />
  ) : setByYouOpen ? (
    <SetByYou
      modified={modified}
      deviceName={deviceName}
      persisted={services.persisted}
      onResetPreferences={visit.resetPreferences}
      onResetShortcuts={visit.resetShortcuts}
      onShortcuts={visit.setShortcuts}
    />
  ) : (
    <Pane
      pane={pane}
      deviceName={deviceName}
      persisted={services.persisted}
      onShortcuts={visit.setShortcuts}
    />
  );

  return (
    <SettingsProvider store={visit.store}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex min-h-row flex-wrap items-center gap-4 px-2">
          <Button
            variant="ghost"
            className="text-ui"
            onClick={() => void navigate({ href: from })}
          >
            {SEND_WORDS.back(placeName)}
          </Button>
          <h1 tabIndex={-1} className="text-title">
            {PREFERENCES_WORDS.title}
          </h1>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:flex-row">
          <div className="flex flex-col gap-2 sm:w-56 sm:shrink-0">
            <Input
              ref={search}
              type="search"
              aria-label={PREFERENCES_WORDS.search}
              placeholder={PREFERENCES_WORDS.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKey}
              className="h-control text-ui"
            />
            {count === 0 ? null : (
              <Button
                variant="ghost"
                className="justify-start text-ui"
                onClick={() => setSetByYouOpen(true)}
              >
                {PREFERENCES_WORDS.setByYouCount(count)}
              </Button>
            )}
            <PaneList pane={pane} onPane={showPane} />
          </div>
          <div ref={results} className="min-w-0 flex-1">
            {body}
          </div>
        </div>
        <ShellRegion
          region="status_bar"
          className="flex min-h-row items-center gap-2 px-2"
        >
          <MessageSlot
            queue={services.messages}
            run={(id) => {
              if (isCommandId(id)) services.commands.run(id, "control");
            }}
            registered={isCommandId}
          />
          <CommandButton id="app.palette" size="sm" />
        </ShellRegion>
      </div>
    </SettingsProvider>
  );
}
