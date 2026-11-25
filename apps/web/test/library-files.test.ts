import { expect, test } from "bun:test";
import { createDoc, readEpisodes, readSeasons } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { LIBRARY_FILES_WORDS, createValue } from "@manent/ui";
import {
  libraryFilesHandlers,
  requestMoveToTrash,
} from "../src/handlers/library-files.ts";
import type { HandlerDeps } from "../src/handlers/index.ts";
import { seriesCreated } from "../src/series/series-start.ts";
import type { LibraryIndex, PersonServices } from "../src/services/ports.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { createDocumentSource } from "../src/shell/palette-documents.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { trashActions } from "../src/state/trash.store.ts";
import {
  QUIET_DOM,
  createNavigation,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

bindGuard(createGuard({ flavour: "test" }));

test("moving a script to Trash refuses safely when people lookup is unavailable", async () => {
  const environment = testEnvironment();
  const base = testServices({ userId: "sam", environment });
  let moved = 0;
  const services: PersonServices = {
    ...base,
    trash: {
      ...base.trash,
      people: async () => null,
      move: async () => {
        moved += 1;
        return { ok: true, purgeAfterAt: 1_000 };
      },
    },
  };
  trashActions.closeConfirm();

  await requestMoveToTrash({
    services,
    navigate: () => {},
    docId: "doc-1",
    title: "Harbour Lights",
    workspaceId: "medium",
    navigateToLibrary: false,
  });

  expect(moved).toBe(0);
  expect(services.messages.current()?.text).toBe(
    LIBRARY_FILES_WORDS.moveToTrashRefused("Harbour Lights"),
  );
});

test("favouriting an open script uses the document's own workspace rather than the query parameter", async () => {
  const environment = testEnvironment();
  const base = testServices({ userId: "sam", environment });
  const toggled: { id: string; workspaceId: string }[] = [];
  const docId = "11111111-1111-4111-8111-111111111111";
  const services: PersonServices = {
    ...base,
    folders: {
      ...base.folders,
      documents: (wsId: string) =>
        createValue(
          wsId === "heavy"
            ? new Map([
                [
                  docId,
                  {
                    projectId: "p-1",
                    title: "Ward Nine",
                    kind: "script",
                    createdAt: 1,
                    editedAt: 2,
                    editedByUserId: "sam",
                    airDate: null,
                    rundownId: null,
                    trashedAt: null,
                    trashedByUserId: null,
                  },
                ],
              ])
            : new Map(),
        ),
    },
    favourites: {
      ...base.favourites,
      toggle: async (_userId, input) => {
        toggled.push({ id: input.id, workspaceId: input.workspaceId });
        return true;
      },
    },
  };
  const route = createNavigation({
    routeId: "/s/$docId",
    href: `/s/${docId}?w=medium`,
    search: { w: "medium" },
  });
  const deps: HandlerDeps = {
    services,
    api: fakeApi({
      me: async () => ({
        ok: true,
        me: {
          userId: "sam",
          name: "Sam Okafor",
          workspaces: [
            { id: "medium", name: "Writers' room", seeding: null },
            { id: "heavy", name: "Lanternfield Studios", seeding: null },
          ],
        },
      }),
    }),
    usePerson: createPersonStore(null),
    router: route.navigation,
    dom: QUIET_DOM,
    shellState: () => ({
      screen: "document",
      docId,
      panels: { left: null, side: null },
      historyPresent: false,
      spaceBeforeSet: false,
    }),
    frame: environment.frame,
    visitUndo: environment.visitUndo,
    desktop: null,
    nodeCloud: null,
    language: environment.language,
    now: environment.now,
    storage: environment.storage,
  };

  libraryFilesHandlers(deps)["library.favourite"]();
  await new Promise<void>((resolve) => setTimeout(resolve, 10));

  expect(toggled).toEqual([{ id: docId, workspaceId: "heavy" }]);
});

test("palette document source retries after a transient search refusal instead of caching empty results", async () => {
  const workspaces: WorkspaceRef[] = [
    { id: "medium", name: "Writers' room", seeding: null },
  ];
  const library = {
    continueList: () => createValue([]),
    projects: () => createValue([]),
  } as unknown as LibraryIndex;

  let calls = 0;
  let updates = 0;
  const source = createDocumentSource({
    userId: "dana",
    library,
    workspaces: () => workspaces,
    currentWorkspaceId: () => "medium",
    online: () => true,
    token: () => "tok",
    fetchFn: Object.assign(
      async () => {
        calls += 1;
        if (calls === 1) return new Response("", { status: 503 });
        return Response.json({
          results: [
            {
              docId: "33333333-3333-4333-8333-333333333333",
              workspaceId: "medium",
              title: "Episode 1",
              projectTitle: "Harbour Lights",
              kind: "script",
              changedAt: 100,
              excerpt: "…harbour…",
            },
          ],
        });
      },
      { preconnect: () => {} },
    ),
    onUpdate: () => {
      updates += 1;
    },
  });

  expect(source.rows("harbour")).toEqual([]);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  expect([calls, updates]).toEqual([1, 0]);

  expect(source.rows("harbour")).toEqual([]);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  expect([calls, updates]).toEqual([2, 1]);
  expect(source.rows("harbour").map((row) => row.id)).toEqual([
    "document:33333333-3333-4333-8333-333333333333",
  ]);
});

test("series creation uses the injected id generator for its opening season and episode", async () => {
  const crdtDoc = createDoc();
  let closed = false;
  const fakeHandle = {
    doc: () => crdtDoc,
    close: async () => {
      closed = true;
    },
  } as unknown as DocHandle;
  const sync = {
    userId: "sam",
    client: { open: async () => fakeHandle },
  } as unknown as PersonSync;
  const seasonId = "00000000-0000-4000-8000-000000000011";
  const episodeId = "00000000-0000-4000-8000-000000000012";
  const ids = [seasonId, episodeId];
  let index = 0;

  await seriesCreated.made({
    sync,
    workspaceId: "medium",
    projectId: "00000000-0000-4000-8000-000000000010",
    kind: "series",
    docId: "00000000-0000-4000-8000-000000000001",
    newId: () => ids[index++] ?? "unexpected",
  });

  expect(closed).toBe(true);
  expect([...readSeasons(crdtDoc).keys()]).toEqual([seasonId]);
  expect([...readEpisodes(crdtDoc).keys()]).toEqual([episodeId]);
  crdtDoc.destroy();
});
