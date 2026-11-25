import { expect, test } from "bun:test";
import type { SearchResponse, WorkspaceRef } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import { offlineSearchWorkspace } from "../src/search/offline-search.ts";
import {
  changedPresetDate,
  highlightExcerpt,
  parseClientQuery,
  setQueryOperator,
} from "../src/search/search-query.ts";
import type {
  ContinueItem,
  LibraryIndex,
  ProjectItem,
} from "../src/services/ports.ts";
import type { FolderEntry } from "../src/services/sync/folders.ts";
import type { DocumentEntry } from "../src/services/sync/index-entries.ts";
import { createDocumentSource } from "../src/shell/palette-documents.ts";

test("query parsing handles phrases, operators, replacements, and unreadable operators (point 31)", () => {
  const valid = parseClientQuery(
    'Tamsin "the Founding" type:script after:2026-11-01 folder:"Film — Production"',
  );
  expect(valid.unsatisfiable).toBe(false);
  expect(valid.hasFilterOperator).toBe(true);
  expect(valid.words).toEqual(["Tamsin"]);
  expect(valid.phrases).toEqual(["the Founding"]);
  expect(valid.kinds).toEqual(["script"]);
  expect(valid.activeAfter).toBe("2026-11-01");
  expect(valid.activeFolder).toBe("Film — Production");

  expect(parseClientQuery("type:poem").unsatisfiable).toBe(true);
  expect(parseClientQuery("type:poem").hasFilterOperator).toBe(true);
  expect(parseClientQuery("after:17 Nov").unsatisfiable).toBe(true);
  expect(parseClientQuery("after:17 Nov").hasFilterOperator).toBe(true);

  expect(setQueryOperator("Tamsin type:script", "type", "rundown")).toBe(
    "Tamsin type:rundown",
  );
  expect(setQueryOperator("Tamsin type:script", "type", null)).toBe("Tamsin");
  expect(setQueryOperator("Tamsin", "folder", "Film — Production")).toBe(
    'Tamsin folder:"Film — Production"',
  );

  const nov18 = new Date(2026, 10, 18, 12, 0).getTime();
  expect(changedPresetDate(nov18, "today")).toBe("2026-11-18");
  expect(changedPresetDate(nov18, "last7")).toBe("2026-11-11");
  expect(changedPresetDate(nov18, "thisYear")).toBe("2026-01-01");

  expect(
    highlightExcerpt("…the Founding at Carrow Height…", [], ["the Founding"]),
  ).toEqual([
    { text: "…", matched: false },
    { text: "the Founding", matched: true },
    { text: " at Carrow Height…", matched: false },
  ]);
});

test("offlineSearchWorkspace matches titles, type:, nested folder:, skips Trash, and returns [] on unreadable operators", () => {
  const folders: FolderEntry[] = [
    {
      id: "f-tv",
      name: "Television",
      parentId: null,
      createdAt: 1,
      createdByUserId: "dana",
    },
    {
      id: "f-drama",
      name: "Drama",
      parentId: "f-tv",
      createdAt: 2,
      createdByUserId: "dana",
    },
  ];
  const projects: ProjectItem[] = [
    {
      projectId: "p-hl",
      title: "Harbour Lights",
      kind: "series",
      firstDocId: "d1",
      lastEdited: { byName: "Dana", at: 200 },
      place: { kind: "synced" },
    },
    {
      projectId: "p-ln",
      title: "The Long Night",
      kind: "film",
      firstDocId: "d2",
      lastEdited: { byName: "Dana", at: 100 },
      place: { kind: "synced" },
    },
  ];
  const documents = new Map<string, DocumentEntry>([
    [
      "d1",
      {
        projectId: "p-hl",
        title: "Harbour Lights 204",
        kind: "script",
        createdAt: 10,
        editedAt: 200,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: null,
        trashedByUserId: null,
      },
    ],
    [
      "d2",
      {
        projectId: "p-ln",
        title: "Harbour Draft Trashed",
        kind: "script",
        createdAt: 10,
        editedAt: 300,
        editedByUserId: "dana",
        airDate: null,
        rundownId: null,
        trashedAt: 400,
        trashedByUserId: "dana",
      },
    ],
  ]);
  const projectFolders = new Map<string, string | null>([
    ["p-hl", "f-drama"],
    ["p-ln", null],
  ]);

  // Nested folder match (Television includes Drama), Trash excluded.
  const nested = offlineSearchWorkspace({
    workspaceId: "medium",
    query: "Harbour folder:Television type:series after:2026-11-01",
    projects,
    documents,
    folders,
    projectFolders,
  });
  expect(nested.map((r) => r.docId)).toEqual(["d1"]);

  // Unreadable operator matches nothing.
  expect(
    offlineSearchWorkspace({
      workspaceId: "medium",
      query: "Harbour type:poem",
      projects,
      documents,
      folders,
      projectFolders,
    }),
  ).toEqual([]);
});

test("palette createDocumentSource answers titles across workspaces immediately and appends deduplicated body matches asynchronously", async () => {
  const workspaces: WorkspaceRef[] = [
    { id: "medium", name: "Writers' room", seeding: null },
    { id: "heavy", name: "Lanternfield Studios", seeding: null },
  ];
  const continueByWs: Record<string, ContinueItem[]> = {
    medium: [
      {
        docId: "11111111-1111-4111-8111-111111111111",
        title: "The Long Night",
        projectTitle: "The Long Night",
        kind: "film",
        place: { kind: "synced" },
      },
    ],
    heavy: [
      {
        docId: "22222222-2222-4222-8222-222222222222",
        title: "The Keeper of the Last Bell",
        projectTitle: "The Keeper of the Last Bell: The Silent Valley",
        kind: "book",
        place: { kind: "synced" },
      },
    ],
  };
  const library = {
    continueList: (w: string) => createValue(continueByWs[w] ?? []),
    projects: () => createValue([]),
  } as unknown as LibraryIndex;

  let updates = 0;
  let fetchedUrl = "";
  const bodyAnswer: SearchResponse = {
    results: [
      {
        docId: "22222222-2222-4222-8222-222222222222",
        workspaceId: "heavy",
        title: "The Keeper of the Last Bell",
        projectTitle: "The Keeper of the Last Bell: The Silent Valley",
        kind: "script",
        changedAt: 100,
        excerpt: "…bell…",
      },
      {
        docId: "33333333-3333-4333-8333-333333333333",
        workspaceId: "heavy",
        title: "Episode 1",
        projectTitle: "Ward Nine",
        kind: "script",
        changedAt: 200,
        excerpt: "…bell rings…",
      },
      {
        docId: "44444444-4444-4444-8444-444444444444",
        workspaceId: "medium",
        title: "204",
        projectTitle: "Harbour Lights",
        kind: "script",
        changedAt: 150,
        excerpt: "…bell…",
      },
    ],
  };

  const source = createDocumentSource({
    userId: "dana",
    library,
    workspaces: () => workspaces,
    currentWorkspaceId: () => "medium",
    online: () => true,
    token: () => "tok",
    fetchFn: (async (input: string | URL | Request) => {
      fetchedUrl = String(input);
      return new Response(JSON.stringify(bodyAnswer), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    onUpdate: () => {
      updates += 1;
    },
  });

  // Immediate title match includes cross-workspace S4-SR-21 home line.
  const first = source.rows("Bell");
  expect(first.map((r) => [r.id, r.label, r.home])).toEqual([
    [
      "document:22222222-2222-4222-8222-222222222222",
      "The Keeper of the Last Bell",
      "The Keeper of the Last Bell: The Silent Valley · Lanternfield Studios",
    ],
  ]);

  // Wait for async body search response.
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  expect(updates).toBe(1);
  expect(fetchedUrl).toContain("/api/search?");
  expect(fetchedUrl).not.toContain("workspaceId=");

  const second = source.rows("Bell");
  expect(second.map((r) => [r.id, r.label, r.home])).toEqual([
    [
      "document:22222222-2222-4222-8222-222222222222",
      "The Keeper of the Last Bell",
      "The Keeper of the Last Bell: The Silent Valley · Lanternfield Studios",
    ],
    [
      "document:33333333-3333-4333-8333-333333333333",
      "Episode 1",
      "Ward Nine · Lanternfield Studios · in the text",
    ],
    [
      "document:44444444-4444-4444-8444-444444444444",
      "204",
      "Harbour Lights · in the text",
    ],
  ]);
});
