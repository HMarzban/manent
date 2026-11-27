// The shell's palette over commands, settings, places, scripts and the people present, loaded apart from the entry.
import {
  COMMANDS,
  DEFAULT_QUICK_SETTINGS_LIMIT,
  DEFAULT_RECENT_LIMIT,
  DEFAULT_SUGGESTED_LIMIT,
  contextBoost,
  recommendPalette,
} from "@manent/commands";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  BESIDE_WORDS,
  CommandPalette,
  PALETTE_WORDS,
  createCommandSource,
  createSettingSource,
} from "@manent/ui";
import type { PaletteFilter, PaletteRow } from "@manent/ui";
import { QueryClientContext } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createBesideSource, runBesideRow } from "../beside/beside-source.ts";
import { BESIDE_BODY } from "../beside/open-beside.ts";
import { livePagination } from "../editor-host/live-editor.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { readPerson } from "../session.ts";
import {
  FactsContext,
  OutlineContext,
  PeopleContext,
} from "../state/bridge-contexts.ts";
import {
  selectors as paletteSelectors,
  usePaletteAsk,
  usePaletteInTitlePage,
  usePaletteOpen,
} from "../state/palette.store.ts";
import {
  formatPaletteContext,
  snapshotPaletteSignals,
} from "./palette-context.ts";
import { createDocumentSource } from "./palette-documents.ts";
import { computeQuickJumps } from "./palette-jumps.ts";
import {
  createPersonSource,
  createPlaceSource,
  runPlaceRow,
} from "./palette-places.ts";
import { createPaletteUsage } from "./palette-usage.ts";

/** The palette's placeholder for each filter. */
const PLACEHOLDERS: Readonly<Record<PaletteFilter, string>> = Object.freeze({
  all: PALETTE_WORDS.placeholder,
  places: PALETTE_WORDS.placeholderPlaces,
  beside: BESIDE_WORDS.choose,
});

const KNOWN_COMMAND_IDS: ReadonlySet<string> = new Set(
  COMMANDS.map((command) => command.id),
);

const BODY_SEARCH_DEBOUNCE_MS = 150;

/** The workspaces the person's scripts are in: those the server listed for the Library, if it was asked. */
function useKnownWorkspaces(userId: string): () => readonly WorkspaceRef[] {
  const queries = useContext(QueryClientContext);
  return useCallback(
    () => queries?.getQueryData<readonly WorkspaceRef[]>(["me", userId]) ?? [],
    [queries, userId],
  );
}

/**
 * The palette over commands, settings, the open script's places, the person's scripts (titles + async body matches)
 * and the people present; a setting reads the open document's store, so its script settings show. Filtered to Beside,
 * it lists only what can open beside the open script.
 */
export function ShellPalette(props: {
  docId: string | null;
  close(): void;
}): ReactNode {
  const { docId, close } = props;
  const services = useServices();
  const env = useEnvironment();
  const { where, dom, frame, online, tabStorage, schedule, now } = env;
  const router = useRouter();
  const outline = useContext(OutlineContext);
  const people = useContext(PeopleContext);
  const facts = useContext(FactsContext);
  const knownWorkspaces = useKnownWorkspaces(services.userId);
  const workspaceIds = useCallback(
    () => [
      ...new Set([...knownWorkspaces().map((w) => w.id), services.userId]),
    ],
    [knownWorkspaces, services.userId],
  );
  const filter = usePaletteOpen();
  const ask = usePaletteAsk();
  const inTitlePage = usePaletteInTitlePage();
  const isOpen = filter !== null || ask !== null;
  const [, setSearchVersion] = useState(0);

  const usageStore = useMemo(
    () =>
      createPaletteUsage({
        userId: services.userId,
        storage: env.storage,
        events: env.storageEvents,
      }),
    [services.userId, env.storage, env.storageEvents],
  );
  useEffect(() => () => usageStore.dispose(), [usageStore]);

  // Snapshot once on each open (zero reactive subscriptions to editor transactions)
  const routeId = router.state.matches.at(-1)?.routeId ?? null;
  const smart = useMemo(() => {
    if (!isOpen || filter !== "all") return null;
    const openedNow = now();
    const signals = snapshotPaletteSignals({
      docId,
      routeId,
      inTitlePage,
      services,
      env,
      facts,
      outline,
      people,
    });
    const usage = usageStore.read();
    const available = (id: string) =>
      KNOWN_COMMAND_IDS.has(id) ? services.commands.state(id) : null;
    const jumpTo = computeQuickJumps({
      signals,
      userId: services.userId,
      workspaceIds: workspaceIds(),
      library: services.library,
      pagination: () => (docId === null ? null : livePagination(docId)),
      caretBlockId: facts?.get("blockId") ?? null,
      people: people?.get() ?? [],
    });
    const hasJumps = jumpTo.length > 0;
    const recommendations = recommendPalette({
      signals,
      usage,
      available,
      now: openedNow,
      suggestedLimit: hasJumps ? 3 : DEFAULT_SUGGESTED_LIMIT,
      quickSettingsLimit: hasJumps ? 2 : DEFAULT_QUICK_SETTINGS_LIMIT,
      recentLimit: hasJumps ? 2 : DEFAULT_RECENT_LIMIT,
    });
    const context = formatPaletteContext(signals, facts);
    const boost = (row: PaletteRow): number =>
      row.kind === "command" || row.kind === "setting"
        ? contextBoost(row.id, signals, usage, openedNow)
        : 0;
    return { recommendations, jumpTo, context, boost };
  }, [
    isOpen,
    filter,
    docId,
    routeId,
    inTitlePage,
    services,
    env,
    facts,
    outline,
    people,
    workspaceIds,
    usageStore,
    now,
  ]);

  // before the editor's code arrives no editor is open, and there are no pages
  const pagination = () => (docId === null ? null : livePagination(docId));
  const sources = useMemo(() => {
    if (filter === "beside")
      return [
        createBesideSource({
          here: () =>
            docId === null
              ? null
              : { docId, services, workspaceIds: workspaceIds() },
        }),
      ];
    const base = {
      commands: COMMANDS,
      service: services.commands,
      platform: where.platform,
      shell: where.shell,
    };
    const { library } = services;
    return [
      createCommandSource(base),
      createSettingSource({
        ...base,
        settings:
          docId === null ? services.settings : services.openScriptStore(docId),
        scopeWords: {
          ...PALETTE_WORDS.scope,
          device: PALETTE_WORDS.scope.device(where.shell === "desktop"),
        },
      }),
      ...(docId === null || outline === null
        ? []
        : [
            createPlaceSource({
              outline,
              pagination: () => livePagination(docId),
            }),
          ]),
      createDocumentSource({
        userId: services.userId,
        library,
        workspaces: knownWorkspaces,
        currentWorkspaceId: () => {
          const search = router.state.location.search as Record<
            string,
            unknown
          >;
          return typeof search.w === "string" && search.w.trim() !== ""
            ? search.w
            : null;
        },
        online,
        token: () => readPerson(tabStorage)?.token ?? null,
        debounceMs: BODY_SEARCH_DEBOUNCE_MS,
        schedule,
        onUpdate: () => setSearchVersion((v) => v + 1),
      }),
      ...(docId === null || people === null
        ? []
        : [createPersonSource({ people: () => people.get() })]),
    ];
  }, [
    filter,
    services,
    where,
    docId,
    outline,
    people,
    knownWorkspaces,
    workspaceIds,
    router,
    online,
    tabStorage,
    schedule,
  ]);
  const run = (row: PaletteRow): void => {
    if (runBesideRow(row.id)) {
      // what is beside the page is opened to be used, so focus moves into it once it is drawn
      frame(() => dom.focusSidePanel(`[${BESIDE_BODY}]`));
      return;
    }
    if (row.kind !== "command" && row.kind !== "setting") {
      runPlaceRow(row.id, {
        editor: services.editor,
        pagination,
        caretBlockId: () => facts?.get("blockId") ?? null,
        navigate: (href) => void router.navigate({ href }),
      });
      return;
    }
    // only a command that ran is recorded; reportingRuns persists usage into palette-usage
    services.commands.run(row.id, "palette");
  };
  return (
    <CommandPalette
      open={isOpen}
      filter={filter ?? "all"}
      sources={sources}
      placeholder={PLACEHOLDERS[filter ?? "all"]}
      ask={ask}
      onRun={run}
      onClose={() => {
        if (paletteSelectors.isOpen()) close();
      }}
      recent={smart?.recommendations.recent ?? []}
      context={smart?.context ?? null}
      suggested={smart?.recommendations.suggested}
      jumpTo={smart?.jumpTo}
      quickSettings={smart?.recommendations.quickSettings}
      boost={smart?.boost}
      enableScopes={filter === "all"}
    />
  );
}
