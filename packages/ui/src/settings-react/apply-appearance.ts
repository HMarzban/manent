// Appearance lives in attributes on the root element, written here and replayed by the boot script before the first paint.
import { mark } from "@manent/perf";
import { SETTINGS } from "@manent/settings";
import type { SettingsStore } from "@manent/settings";

/** One write the boot script replays: set attribute `name` to the value, or remove it when the value is null. */
export type BootWrite = readonly ["a", string, string | null];

type Definition = (typeof SETTINGS)["all"][number];

interface AttributeSetting {
  readonly def: Definition;
  readonly name: string;
  readonly values: Readonly<Record<string, string | null>>;
}

const ATTRIBUTE_SETTINGS: readonly AttributeSetting[] = Object.freeze(
  SETTINGS.all.flatMap((def: Definition) =>
    def.apply.how === "attribute"
      ? [{ def, name: def.apply.name, values: def.apply.values }]
      : [],
  ),
);

// the colour transitions are held off for the one frame in which the theme or palette changes
const THEME_ATTRIBUTES: ReadonlySet<string> = new Set([
  "data-theme",
  "data-palette",
]);
const SWITCHING_ATTRIBUTE = "data-switching";

const DARK_MEDIA = "(prefers-color-scheme: dark)";

function syncThemeColorMeta(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta === null) return;
  const view = doc.defaultView;
  if (view === null || typeof view.getComputedStyle !== "function") return;
  const target = doc.body ?? root;
  const bg = view.getComputedStyle(target).backgroundColor.trim();
  if (
    bg !== "" &&
    bg !== "transparent" &&
    !/,\s*0\s*\)$/.test(bg) &&
    !bg.includes("light-dark(")
  )
    meta.setAttribute("content", bg);
}

function attributeValue(
  store: SettingsStore,
  setting: AttributeSetting,
): string | null {
  return setting.values[String(store.get(setting.def.key))] ?? null;
}

function writeAttribute(
  root: HTMLElement,
  name: string,
  value: string | null,
): void {
  if (value === null) root.removeAttribute(name);
  else root.setAttribute(name, value);
}

function bootWrites(store: SettingsStore): readonly BootWrite[] {
  return ATTRIBUTE_SETTINGS.filter((s) => s.def.boot).map((s): BootWrite => [
    "a",
    s.name,
    attributeValue(store, s),
  ]);
}

/**
 * Writes every attribute setting onto `root` now and on each change, and after each write hands
 * `onBootWrites` the writes of every boot setting, for the cache the boot script reads. `frame` runs
 * a function on the next frame and returns its cancel. Returns the unsubscriber.
 */
export function applyAppearance(options: {
  store: SettingsStore;
  root: HTMLElement;
  frame: (fn: () => void) => () => void;
  onBootWrites: (writes: readonly BootWrite[]) => void;
}): () => void {
  const { store, root, frame, onBootWrites } = options;
  let cancelFrame: (() => void) | null = null;

  const switchTheme = (): void => {
    cancelFrame?.();
    root.setAttribute(SWITCHING_ATTRIBUTE, "");
    cancelFrame = frame(() => {
      cancelFrame = null;
      root.removeAttribute(SWITCHING_ATTRIBUTE);
    });
  };

  const write = (setting: AttributeSetting): void => {
    mark("ui.setting.apply", () => {
      const value = attributeValue(store, setting);
      if (
        THEME_ATTRIBUTES.has(setting.name) &&
        root.getAttribute(setting.name) !== value &&
        !root.hasAttribute(SWITCHING_ATTRIBUTE)
      )
        switchTheme();
      writeAttribute(root, setting.name, value);
      if (THEME_ATTRIBUTES.has(setting.name)) syncThemeColorMeta(root);
    });
    onBootWrites(bootWrites(store));
  };

  const unsubscribers = ATTRIBUTE_SETTINGS.map((setting) => {
    write(setting);
    return store.subscribe(setting.def.key, () => write(setting));
  });
  const view = root.ownerDocument.defaultView;
  const media =
    view !== null && typeof view.matchMedia === "function"
      ? view.matchMedia(DARK_MEDIA)
      : null;
  const onSchemeChange = (): void => {
    if (store.get("appearance.theme") === "system") syncThemeColorMeta(root);
  };
  media?.addEventListener("change", onSchemeChange);
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    media?.removeEventListener("change", onSchemeChange);
    cancelFrame?.();
  };
}
