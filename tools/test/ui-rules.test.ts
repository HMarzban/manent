import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { checkUiRules } from "../check-ui-rules.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const trees = createTempTrees("manent ui rules ");
afterAll(trees.removeAll);

const lines = (...text: string[]): string => `${text.join("\n")}\n`;

const check = async (files: Record<string, string>) =>
  checkUiRules(await trees.tree(files));

test("a store is created only in a state store file, which exports only hooks, actions, selectors, factories and types", async () => {
  expect(
    await check({
      "apps/web/src/shell/frame-state.ts": lines(
        'import { create } from "zustand";',
        "export const useFrame = create(() => ({ open: false }));",
      ),
      "apps/web/src/shell/vanilla.ts": lines(
        'import type { StoreApi } from "zustand";',
        'import { useStore } from "zustand";',
        "export { useStore };",
        "export type Api = StoreApi<number>;",
      ),
      "apps/web/src/state/frame.store.ts": lines(
        'import { createStore } from "zustand";',
        "const store = createStore(() => ({ open: false }));",
        "export function useFrameOpen() { return store.getState().open; }",
        "export const frameActions = { close() {} };",
        "export function createFrameStore() { return store; }",
        "export { store as selectors };",
        "export interface FrameState { open: boolean }",
        "export type FrameOpen = boolean;",
        "export const FRAME_LIMIT = 3;",
      ),
    }),
  ).toEqual([
    {
      file: "apps/web/src/shell/frame-state.ts",
      line: 1,
      rule: "store-private",
      message: "create from zustand outside a state/*.store.ts file",
    },
    {
      file: "apps/web/src/state/frame.store.ts",
      line: 9,
      rule: "store-private",
      message: "a store file exports FRAME_LIMIT",
    },
  ]);
});

test("only the editor host's components reach the editor", async () => {
  expect(
    await check({
      "apps/web/src/shell/frame.tsx": lines(
        'import type { EditorView } from "prosemirror-view";',
        'import { TEXT } from "../text.ts";',
      ),
      "apps/web/src/editor-host/host.tsx": lines(
        'import { createEditor } from "@manent/editor";',
        'import { bind } from "@manent/crdt-binding";',
      ),
      "apps/web/src/shell/glue.ts": lines(
        'import { bind } from "y-prosemirror";',
      ),
      "packages/ui/src/editorial.tsx": lines(
        'import { x } from "@manent/editorial";',
      ),
    }),
  ).toEqual([
    {
      file: "apps/web/src/shell/frame.tsx",
      line: 1,
      rule: "editor-reach",
      message: "a component imports prosemirror-view",
    },
  ]);
});

test("storage is touched only in its own modules", async () => {
  expect(
    await check({
      "apps/web/src/shell/keep.ts": lines(
        "// sessionStorage is never read here",
        'const label = "localStorage";',
        "export const kept = window.localStorage;",
      ),
      "apps/web/src/session.ts": lines(
        "export const tab = () => window.sessionStorage;",
      ),
      "apps/web/src/services/device-bag.ts": lines(
        "export const device = () => localStorage;",
      ),
      "packages/client-web/src/database.ts": lines(
        "export const open = () => indexedDB.open('manent');",
      ),
    }),
  ).toEqual([
    {
      file: "apps/web/src/shell/keep.ts",
      line: 3,
      rule: "storage-direct",
      message: "localStorage outside the storage modules",
    },
  ]);
});

test("the platform is read only in the platform module", async () => {
  expect(
    await check({
      "packages/ui/src/keys.ts": lines(
        "export const language = navigator.language;",
        "export const mac = navigator.platform.startsWith('Mac');",
      ),
      "apps/web/src/platform.ts": lines(
        "export const agent = () => navigator.userAgent;",
      ),
    }),
  ).toEqual([
    {
      file: "packages/ui/src/keys.ts",
      line: 2,
      rule: "platform-direct",
      message: "navigator.platform outside apps/web/src/platform.ts",
    },
  ]);
});

test("no view transition is started", async () => {
  expect(
    await check({
      "apps/web/src/shell/go.ts": lines(
        'const name = "startViewTransition";',
        "document.startViewTransition(() => {});",
      ),
    }),
  ).toEqual([
    {
      file: "apps/web/src/shell/go.ts",
      line: 2,
      rule: "no-view-transition",
      message: "startViewTransition is called",
    },
  ]);
});

test("every visible word comes from a word table", async () => {
  expect(
    await check({
      "apps/web/src/shell/bar.tsx": lines(
        "export function Bar(p: { n: number }) {",
        "  return (",
        '    <div aria-label={T.bar} title="12 · 3">',
        "      <b>Couldn't start</b><i>{T.x}</i>",
        "      {p.n} · 2",
        '      <input placeholder="Search…" />',
        "    </div>",
        "  );",
        "}",
      ),
      "packages/ui/src/components/stock/button.tsx": lines(
        "export const Close = () => <span>Close</span>;",
      ),
      "apps/web/test/bar.dom.test.tsx": lines(
        'import { withDom } from "@manent/testkit/dom";',
        "const probe = <p>Probe</p>;",
      ),
    }),
  ).toEqual([
    {
      file: "apps/web/src/shell/bar.tsx",
      line: 4,
      rule: "literal-text",
      message: 'literal text "Couldn\'t start"',
    },
    {
      file: "apps/web/src/shell/bar.tsx",
      line: 6,
      rule: "literal-text",
      message: 'placeholder holds literal text "Search…"',
    },
  ]);
});

test("a DOM test registers the DOM before anything else is imported", async () => {
  expect(
    await check({
      "apps/web/test/frame.dom.test.tsx": lines(
        'import { expect, test } from "bun:test";',
        'import { withDom } from "@manent/testkit/dom";',
      ),
      "packages/ui/test/row.dom.test.tsx": lines(
        'import { withDom } from "@manent/testkit/dom";',
        'import { expect, test } from "bun:test";',
      ),
      "packages/testkit/test/own.dom.test.ts": lines(
        'import { withDom } from "../src/dom.ts";',
      ),
      "apps/web/test/plain.test.ts": lines(
        'import { expect, test } from "bun:test";',
      ),
    }),
  ).toEqual([
    {
      file: "apps/web/test/frame.dom.test.tsx",
      line: 1,
      rule: "dom-first",
      message: "the first import is bun:test, not @manent/testkit/dom",
    },
  ]);
});

test("motion uses duration tokens and animates only opacity, transform and colours", async () => {
  expect(
    await check({
      "packages/ui/src/theme.css": lines(
        ":root { --default-transition-duration: 100ms; }",
        ".a { transition: opacity var(--dur-fast) var(--curve-out), transform var(--dur-base) ease-out; }",
        ".b { animation: none !important; transition: none; }",
        ".c { transition: width 150ms; }",
        ".animate-spin { transition-property: color, border-color; }",
      ),
      "packages/ui/src/components/stock/shadcn.css": lines(
        ".s { transition: all 200ms; }",
      ),
      "apps/web/src/styles.css": lines(
        ".d { animation: pulse var(--dur-slow) infinite; }",
      ),
    }),
  ).toEqual([
    {
      file: "apps/web/src/styles.css",
      line: 1,
      rule: "motion",
      message: "animation names pulse",
    },
    {
      file: "packages/ui/src/theme.css",
      line: 4,
      rule: "motion",
      message: "transition names width",
    },
    {
      file: "packages/ui/src/theme.css",
      line: 4,
      rule: "motion",
      message: "transition takes 150ms, not a var(--dur-…) token",
    },
  ]);
});

test("this repository breaks no interface rule", async () => {
  expect(await checkUiRules(repoRoot)).toEqual([]);
});
