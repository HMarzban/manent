import { expect, test } from "bun:test";
import type { CommandContext, RecommendationSignals } from "@manent/commands";
import { createValue } from "@manent/ui";
import { formatPaletteContext } from "../src/shell/palette-context.ts";
import { createDocumentSource } from "../src/shell/palette-documents.ts";
import {
  createPaletteUsage,
  paletteUsageKey,
} from "../src/shell/palette-usage.ts";
import type { LibraryIndex } from "../src/services/ports.ts";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const BASE_CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: true,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: false,
  signedIn: true,
  workspace: "writable",
  panelOpen: { left: false, side: false },
  historyPresent: true,
  format: "screenplay",
  rulerShown: false,
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: "fit_width",
  zoomPercent: 100,
  production: null,
  docKind: "script",
  projectKind: "film",
  outlineStart: false,
  writing: { position: "everyone", othersHaveAccess: true },
  material: null,
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: true,
  focusMode: false,
  readingAloud: false,
  sprintRunning: false,
};

const noEvents = () => () => {};

const caption = (
  signals: RecommendationSignals,
  scene: string | null = null,
  page: string | null = null,
) =>
  formatPaletteContext(signals, {
    get: ((key: string) => {
      if (key === "scene") return scene;
      if (key === "page") return page;
      return null;
    }) as never,
    subscribe: () => () => {},
  });

test("createPaletteUsage persists bounded usage per person and ignores malformed storage entries", () => {
  const storage = memoryStorage();
  const first = createPaletteUsage({
    userId: "sam",
    storage,
    events: noEvents,
  });
  first.record("doc.export", "document", 1000);
  first.record("doc.export", "document", 2000);
  first.record("app.palette", "document", 3000);
  first.dispose();

  const second = createPaletteUsage({
    userId: "sam",
    storage,
    events: noEvents,
  });
  expect(second.read()).toEqual([
    { id: "doc.export", count: 2, lastAt: 2000, lastScreen: "document" },
  ]);
  second.dispose();

  storage.setItem(
    paletteUsageKey("sam"),
    JSON.stringify({ usage: ["bad", { id: 123 }] }),
  );
  const corrupt = createPaletteUsage({
    userId: "sam",
    storage,
    events: noEvents,
  });
  expect(corrupt.read()).toEqual([]);
  corrupt.dispose();
});

test("formatPaletteContext produces calm captions across screens and document modes", () => {
  expect([
    caption({ command: BASE_CTX }, "Scene 4"),
    caption({ command: BASE_CTX, inTitlePage: true }),
    caption({ command: BASE_CTX, historyScreen: true }),
    caption({
      command: {
        ...BASE_CTX,
        production: {
          locked: true,
          canLock: true,
          canIssue: true,
          recallOpen: false,
          waiting: 0,
          activeName: "Pink",
          recallName: null,
          selection: null,
          mode: "collated",
          tint: false,
        },
      },
    }),
    caption({ command: { ...BASE_CTX, docKind: "rundown", format: null } }),
    caption({ command: { ...BASE_CTX, screen: "library", docOpen: false } }),
    caption({
      command: {
        ...BASE_CTX,
        writing: { position: "private", othersHaveAccess: true },
      },
    }),
    caption({ command: { ...BASE_CTX, online: false } }),
  ]).toEqual([
    "Screenplay · Scene 4",
    "Screenplay · Title page",
    "Version history",
    "Locked · Pink",
    "Rundown",
    "Library",
    "Screenplay · Private copy",
    "Screenplay · Offline",
  ]);
});

test("createDocumentSource debounces rapid async body searches when debounceMs is configured", async () => {
  const fetched: string[] = [];
  const pending: (() => void)[] = [];
  const library = {
    continueList: () => createValue([]),
    projects: () => createValue([]),
  } as unknown as LibraryIndex;
  let updates = 0;
  const source = createDocumentSource({
    userId: "sam",
    library,
    workspaces: () => [],
    currentWorkspaceId: () => null,
    online: () => true,
    token: () => "tok",
    debounceMs: 150,
    schedule: (fn) => {
      let active = true;
      pending.push(() => {
        if (active) fn();
      });
      return () => {
        active = false;
      };
    },
    fetchFn: (async (url: string | URL | Request) => {
      fetched.push(String(url));
      return new Response(
        JSON.stringify({
          results: [
            {
              docId: "11111111-1111-4111-8111-111111111111",
              title: "Harbour Lights",
              projectTitle: "Harbour Lights",
              workspaceId: "sam",
              kind: "script",
              changedAt: 100,
              excerpt: "…harbour…",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch,
    onUpdate: () => {
      updates += 1;
    },
  });

  source.rows("h");
  source.rows("ha");
  source.rows("har");
  expect(fetched).toEqual([]);
  for (const run of pending) run();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetched.length).toBe(1);
  expect(fetched[0]).toContain("q=har");
  expect(updates).toBe(1);
});
