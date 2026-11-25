// The shell's palette over commands, settings, places, scripts and the people present, loaded apart from the entry.
import { COMMANDS } from "@manent/commands";
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
import { useCallback, useContext, useMemo, useState } from "react";
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
  usePaletteOpen,
} from "../state/palette.store.ts";
import { createDocumentSource } from "./palette-documents.ts";
import {
  createPersonSource,
  createPlaceSource,
  runPlaceRow,
} from "./palette-places.ts";

/** The palette's placeholder for each filter. */
const PLACEHOLDERS: Readonly<Record<PaletteFilter, string>> = Object.freeze({
  all: PALETTE_WORDS.placeholder,
  places: PALETTE_WORDS.placeholderPlaces,
  beside: BESIDE_WORDS.choose,
});

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
  const { where, dom, frame, online, tabStorage } = useEnvironment();
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
  const [recent, setRecent] = useState<readonly string[]>([]);
  const [, setSearchVersion] = useState(0);
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
    // only a command that ran is one of those run last; a refused one has said why
    if (services.commands.run(row.id, "palette") !== "ran") return;
    setRecent((before) => [row.id, ...before.filter((id) => id !== row.id)]);
  };
  return (
    <CommandPalette
      open={filter !== null || ask !== null}
      filter={filter ?? "all"}
      sources={sources}
      placeholder={PLACEHOLDERS[filter ?? "all"]}
      ask={ask}
      onRun={run}
      onClose={() => {
        if (paletteSelectors.isOpen()) close();
      }}
      recent={recent}
    />
  );
}
