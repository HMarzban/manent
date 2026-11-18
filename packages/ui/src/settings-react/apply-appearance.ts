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

// the colour transitions are held off for the one frame in which the theme changes
const THEME_ATTRIBUTE = "data-theme";
const SWITCHING_ATTRIBUTE = "data-switching";

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
        setting.name === THEME_ATTRIBUTE &&
        root.getAttribute(THEME_ATTRIBUTE) !== value
      )
        switchTheme();
      writeAttribute(root, setting.name, value);
    });
    onBootWrites(bootWrites(store));
  };

  const unsubscribers = ATTRIBUTE_SETTINGS.map((setting) => {
    write(setting);
    return store.subscribe(setting.def.key, () => write(setting));
  });
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    cancelFrame?.();
  };
}
