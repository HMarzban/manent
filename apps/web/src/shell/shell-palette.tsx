// The shell's palette over commands, settings, places, scripts and the people present, loaded apart from the entry.
import { COMMANDS } from "@manent/commands";
import type { Scope } from "@manent/settings";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  CommandPalette,
  createCommandSource,
  createSettingSource,
} from "@manent/ui";
import type { PaletteRow } from "@manent/ui";
import { QueryClientContext } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { livePagination } from "../editor-host/live-editor.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import {
  FactsContext,
  OutlineContext,
  PeopleContext,
} from "../state/bridge-contexts.ts";
import { usePaletteOpen } from "../state/palette.store.ts";
import {
  createDocumentSource,
  createPersonSource,
  createPlaceSource,
  runPlaceRow,
} from "./palette-places.ts";

/** The palette's words for what a setting applies to. */
const scopeWords = (
  shell: "web" | "desktop",
): Readonly<Record<Scope, string>> => ({
  personal: "yours",
  device: shell === "desktop" ? "this device" : "this browser",
  script: "this script",
});

/** The workspaces the person's scripts are in: those the server listed for the Library, if it was asked, and the person's own desk. */
function useWorkspaceIds(userId: string): () => readonly string[] {
  const queries = useContext(QueryClientContext);
  return useCallback(() => {
    const listed = queries?.getQueryData<readonly WorkspaceRef[]>([
      "me",
      userId,
    ]);
    return [...new Set([...(listed ?? []).map((w) => w.id), userId])];
  }, [queries, userId]);
}

/**
 * The palette over commands, settings, the open script's places, the person's scripts and the people present; a
 * setting reads the open document's store, so its script settings show.
 */
export function ShellPalette(props: {
  docId: string | null;
  close(): void;
}): ReactNode {
  const { docId, close } = props;
  const services = useServices();
  const { where } = useEnvironment();
  const router = useRouter();
  const outline = useContext(OutlineContext);
  const people = useContext(PeopleContext);
  const facts = useContext(FactsContext);
  const workspaces = useWorkspaceIds(services.userId);
  const filter = usePaletteOpen();
  const [recent, setRecent] = useState<readonly string[]>([]);
  const pagination = () => (docId === null ? null : livePagination(docId));
  const sources = useMemo(() => {
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
        scopeWords: scopeWords(where.shell),
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
        scripts: () =>
          workspaces().flatMap((w) => library.continueList(w).get()),
        projects: () => workspaces().flatMap((w) => library.projects(w).get()),
      }),
      ...(docId === null || people === null
        ? []
        : [createPersonSource({ people: () => people.get() })]),
    ];
  }, [services, where, docId, outline, people, workspaces]);
  const run = (row: PaletteRow): void => {
    if (row.kind !== "command" && row.kind !== "setting") {
      runPlaceRow(row.id, {
        editor: services.editor,
        pagination,
        caretBlockId: () => facts?.get("blockId") ?? null,
        navigate: (href) => void router.navigate({ href }),
      });
      return;
    }
    services.commands.run(row.id, "palette");
    setRecent((before) => [row.id, ...before.filter((id) => id !== row.id)]);
  };
  return (
    <CommandPalette
      open={filter !== null}
      filter={filter ?? "all"}
      sources={sources}
      onRun={run}
      onClose={close}
      recent={recent}
    />
  );
}
