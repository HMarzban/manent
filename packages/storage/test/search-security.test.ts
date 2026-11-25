import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SEARCH_INDEX_FILE,
  SEARCH_INDEX_VERSION,
  openSqliteSearchIndex,
} from "../src/index.ts";
import type { SearchEntry } from "../src/index.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "manent-search-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function entry(
  overrides: Partial<SearchEntry> & { docId: string },
): SearchEntry {
  return {
    workspaceId: "ws-1",
    kind: "script",
    projectKind: "film",
    title: "Untitled",
    folderIds: [],
    changedAt: 1000,
    generation: 1,
    seq: 1,
    text: "",
    ...overrides,
  };
}

test("viewer queries never match or excerpt editor-only text, and editorDocIds outside docIds are refused", () => {
  const index = openSqliteSearchIndex({ path: ":memory:" });
  index.put(
    entry({
      docId: "doc-cut",
      title: "Episode One",
      text: "Tamsin opens the lighthouse door at dusk.",
      editorText: "Secret cut dialogue mentioning obsidian key.",
      changedAt: 2000,
    }),
  );
  index.put(
    entry({
      docId: "doc-private",
      workspaceId: null,
      title: "Private Notes",
      text: "The obsidian key stays locked away.",
      editorText: "Extra editor note about obsidian.",
      changedAt: 3000,
    }),
  );

  // Viewer cannot match editorText at all
  expect(
    index.query({
      words: ["obsidian"],
      phrases: [],
      docIds: ["doc-cut"],
      limit: 10,
    }),
  ).toEqual([]);

  // Passing doc-private only in editorDocIds (not in docIds) must still refuse it
  expect(
    index.query({
      words: ["obsidian"],
      phrases: [],
      docIds: ["doc-cut"],
      editorDocIds: ["doc-private"],
      limit: 10,
    }),
  ).toEqual([]);

  // Editor on doc-cut matches editorText and receives its excerpt
  expect(
    index.query({
      words: ["obsidian"],
      phrases: [],
      docIds: ["doc-cut"],
      editorDocIds: ["doc-cut"],
      limit: 10,
    }),
  ).toEqual([
    {
      docId: "doc-cut",
      title: "Episode One",
      excerpt: "Secret cut dialogue mentioning obsidian key.",
    },
  ]);

  // Empty docIds always returns nothing
  expect(
    index.query({
      words: ["Tamsin"],
      phrases: [],
      docIds: [],
      editorDocIds: ["doc-cut"],
      limit: 10,
    }),
  ).toEqual([]);

  // Non-finite limits return nothing safely
  for (const limit of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    expect(
      index.query({
        words: ["Tamsin"],
        phrases: [],
        docIds: ["doc-cut"],
        limit,
      }),
    ).toEqual([]);
  }

  index.close();
});

test("FTS5 punctuation and operator input never throws or widens matches, and phrases, filters, ranking and large docId sets match as specified", () => {
  const index = openSqliteSearchIndex({ path: ":memory:" });
  index.put(
    entry({
      docId: "d-title",
      title: "Tamsin Hale",
      kind: "outline",
      projectKind: "series",
      folderIds: ["f-root", "f-child"],
      changedAt: 5000,
      text: "A quiet harbour morning before the Founding begins.",
    }),
  );
  index.put(
    entry({
      docId: "d-body",
      title: "Harbour Scene",
      kind: "script",
      projectKind: "film",
      folderIds: ["f-other"],
      changedAt: 6000,
      text: "Tamsin Hale walks along the pier talking about founding fathers.",
    }),
  );

  // Punctuation and FTS5 keywords are escaped safely and never throw
  expect(
    index.query({
      words: ["OR", "NOT", "NEAR", "co-op", 'a"b', "(test)*:"],
      phrases: ['"quoted" - * :'],
      docIds: ["d-title", "d-body"],
      limit: 10,
    }),
  ).toEqual([]);

  // Punctuation-only query matches nothing rather than returning all documents
  expect(
    index.query({
      words: ["---"],
      phrases: [],
      docIds: ["d-title", "d-body"],
      limit: 10,
    }),
  ).toEqual([]);

  // Exact phrase matches only the document holding the phrase in order
  expect(
    index.query({
      words: [],
      phrases: ["the Founding"],
      docIds: ["d-title", "d-body"],
      limit: 10,
    }),
  ).toEqual([
    {
      docId: "d-title",
      title: "Tamsin Hale",
      excerpt: "A quiet harbour morning before the Founding begins.",
    },
  ]);

  // Title match ranks ahead of body match and returns null excerpt when only title matches
  expect(
    index.query({
      words: ["Tamsin", "Hale"],
      phrases: [],
      docIds: ["d-title", "d-body"],
      limit: 10,
    }),
  ).toEqual([
    { docId: "d-title", title: "Tamsin Hale", excerpt: null },
    {
      docId: "d-body",
      title: "Harbour Scene",
      excerpt:
        "Tamsin Hale walks along the pier talking about founding fathers.",
    },
  ]);

  // Metadata filters (kind, projectKind, folder, date range) and >500 docIds
  const manyDocIds = Array.from({ length: 600 }, (_, i) => `extra-${i}`);
  manyDocIds.push("d-title", "d-body");
  expect(
    index.query({
      words: ["Tamsin"],
      phrases: [],
      kinds: ["outline"],
      projectKinds: ["series"],
      folderIds: ["f-child"],
      afterAt: 4000,
      beforeAt: 5500,
      docIds: manyDocIds,
      limit: 10,
    }),
  ).toEqual([{ docId: "d-title", title: "Tamsin Hale", excerpt: null }]);

  // Updating and removing keeps headOf and indexedDocIds exact
  index.put(
    entry({
      docId: "d-title",
      title: "Tamsin Hale",
      generation: 2,
      seq: 9,
      text: "Updated text without the old phrase.",
    }),
  );
  expect(index.headOf("d-title")).toEqual({ generation: 2, seq: 9 });
  expect(index.indexedDocIds()).toEqual(["d-body", "d-title"]);
  index.remove("d-body");
  expect(index.headOf("d-body")).toBeNull();
  expect(index.indexedDocIds()).toEqual(["d-title"]);
  index.close();
});

test("reopening search.sqlite with a mismatched user_version rebuilds all tables empty at SEARCH_INDEX_VERSION", () => {
  const dir = makeTempDir();
  const first = openSqliteSearchIndex({ dir });
  first.put(entry({ docId: "d-1", title: "Alpha", text: "Body text" }));
  expect(first.indexedDocIds()).toEqual(["d-1"]);
  first.close();

  // Simulate another build's schema version
  const raw = new Database(join(dir, SEARCH_INDEX_FILE));
  raw.run("PRAGMA user_version = 99");
  raw.close();

  const reopened = openSqliteSearchIndex({ dir });
  expect(reopened.indexedDocIds()).toEqual([]);
  expect(reopened.headOf("d-1")).toBeNull();
  reopened.close();

  const verifyVersion = new Database(join(dir, SEARCH_INDEX_FILE));
  const version = verifyVersion
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get()?.user_version;
  verifyVersion.close();
  expect(version).toBe(SEARCH_INDEX_VERSION);
});
