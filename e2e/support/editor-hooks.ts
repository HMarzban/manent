// The test build's editor hooks as an end-to-end test reaches them: every set a tab installs, and the one that finds
// the page's open editor.
import type { Page } from "@playwright/test";

/**
 * Keeps every set of editor hooks the test build installs, in `window.__editorHooks`: a tab may build a person's
 * services more than once, each set installing its own, and only the set whose services drew the page finds its editor.
 */
export async function keepEveryHooks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const installed: unknown[] = [];
    Reflect.set(window, "__editorHooks", installed);
    let manent: unknown = undefined;
    Object.defineProperty(window, "__manent", {
      configurable: true,
      get: () => manent,
      set(value: unknown) {
        manent = value;
        if (typeof value !== "object" || value === null) return;
        let editor: unknown = undefined;
        Object.defineProperty(value, "editor", {
          configurable: true,
          enumerable: true,
          get: () => editor,
          set(hooks: unknown) {
            editor = hooks;
            installed.push(hooks);
          },
        });
      },
    });
  });
}

/** Calls the editor hook `name` of the hooks that find the page's open editor. */
export const editorHook = (
  page: Page,
  name: string,
  ...args: unknown[]
): Promise<unknown> =>
  page.evaluate(
    ([hook, given]) => {
      const installed: unknown = Reflect.get(window, "__editorHooks");
      const live = (Array.isArray(installed) ? installed : []).find(
        (hooks: unknown) => {
          try {
            Reflect.apply(Reflect.get(Object(hooks), "place"), hooks, []);
            return true;
          } catch {
            // these hooks belong to services that drew no page
            return false;
          }
        },
      );
      if (live === undefined)
        throw new TypeError("no editor hooks find the open editor");
      return Reflect.apply(Reflect.get(live, hook), live, given);
    },
    [name, args] as const,
  );
