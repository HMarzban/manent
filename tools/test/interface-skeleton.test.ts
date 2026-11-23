import { expect, test } from "bun:test";
import { dirname, join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

// apps are never imported by name, so the test loads the web app's modules by path
const { createAppRouter } = await import(
  join(repoRoot, "apps/web/src/router.tsx")
);
const { SEND_FORM_IDS, SEND_FORMS, sendPath } = await import(
  join(repoRoot, "apps/web/src/screens/send/forms.ts")
);

const FOLDER_ENTRIES = [
  "commands-react",
  "components/consequence-dialog",
  "components/message-slot",
  "components/panel-tabs",
  "components/row",
  "components/segmented",
  "components/state-bar",
  "components/surface-state",
  "palette",
  "settings-react",
  "subscribable",
  "surfaces",
  "words",
].map((folder) => `packages/ui/src/${folder}/index.ts`);

const codeLines = async (file: string): Promise<string[]> =>
  (await Bun.file(join(repoRoot, file)).text())
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("//"));

/** The files an entry's lines name; a line of any other form stays as it is, so it names no file. */
const namedModules = async (entry: string): Promise<string[]> =>
  (await codeLines(entry)).map((line) => {
    const module = new RegExp(
      '^export \\* from "\\./([a-z][a-z0-9-]*\\.tsx?)";$',
    ).exec(line)?.[1];
    return module === undefined ? line : join(dirname(entry), module);
  });

const exists = (file: string): Promise<boolean> =>
  Bun.file(join(repoRoot, file)).exists();

const refuse = () => {
  throw new Error("this test reaches no server");
};

const routePaths = (): string[] => {
  const router = createAppRouter({ api: {}, fetch: refuse, usePerson: {} });
  return Object.keys(router.routesByPath).toSorted();
};

test("the ui entry lists its folders, and every folder entry names only modules that exist", async () => {
  expect(await codeLines("packages/ui/src/index.ts")).toEqual(
    [
      "./commands-react",
      "./components",
      "./palette",
      "./settings-react",
      "./subscribable",
      "./surfaces",
      "./words",
    ].map((f) => `export * from "${f}/index.ts";`),
  );
  for (const entry of FOLDER_ENTRIES)
    for (const module of await namedModules(entry))
      expect(await exists(module)).toBe(true);
});

test("the routes are the screens of this release", () => {
  // the production flavour
  expect(routePaths()).toEqual([
    "/",
    "/choose",
    "/preferences",
    "/preferences/$pane",
    "/s/$docId",
    "/s/$docId/present",
    "/s/$docId/prompter",
    "/s/$docId/send/$form",
  ]);
});

test("the test build adds the development screens", () => {
  Reflect.set(globalThis, "MANENT_FLAVOUR", "test");
  try {
    expect(routePaths()).toEqual([
      "/",
      "/__keys",
      "/__stand-in",
      "/__states",
      "/choose",
      "/preferences",
      "/preferences/$pane",
      "/s/$docId",
      "/s/$docId/present",
      "/s/$docId/prompter",
      "/s/$docId/send/$form",
    ]);
  } finally {
    Reflect.deleteProperty(globalThis, "MANENT_FLAVOUR");
  }
});

test("a screen that reads the route is that route's own lazily loaded component", () => {
  const router: {
    routesByPath: Record<string, { options: { component?: object } }>;
  } = createAppRouter({ api: {}, fetch: refuse, usePerson: {} });
  const lazy = Object.entries(router.routesByPath)
    .filter(([, route]) => "preload" in (route.options.component ?? {}))
    .map(([path]) => path)
    .toSorted();
  expect(lazy).toEqual([
    "/preferences/$pane",
    "/s/$docId",
    "/s/$docId/present",
    "/s/$docId/prompter",
    "/s/$docId/send/$form",
  ]);
});

test("the Send screen's forms are a registration list that starts empty", () => {
  expect([
    SEND_FORM_IDS,
    SEND_FORMS.map((f: { id: string }) => f.id),
    sendPath("d1", "print"),
  ]).toEqual([
    ["export", "print", "send_draft", "issue", "recall"],
    ["export", "print", "send_draft", "issue", "recall"],
    "/s/d1/send/print",
  ]);
});
