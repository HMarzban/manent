// The point where an editor is mounted into the host, and the ports it is given.

import type { FactsWriter } from "../state/facts.store.ts";
import type { DispatchGuard } from "../state/guard.ts";
import type { OutlineWriter } from "../state/outline.store.ts";

// stands for @manent/settings' SettingKey, which that package does not export yet
type SettingKey = string;

/** What an editor reads of the settings: each value, and a call when one changes. */
export interface SettingsReaderPort {
  get(key: SettingKey): unknown;
  subscribe(key: SettingKey, listener: () => void): () => void;
}

export interface EditorMount {
  /** Draws an editor of `docId` into `element`; the returned function removes it. */
  mount(options: {
    element: HTMLElement;
    docId: string;
    facts: FactsWriter;
    outline: OutlineWriter;
    settings: SettingsReaderPort;
    guard: DispatchGuard;
    /** Present/bare routes mount read-only with no presence publishing from initial mount. */
    bare?: boolean;
    /** False when the caller positions the caret explicitly (e.g. Beside `at`) so saved place does not overwrite it. */
    restorePlace?: boolean;
  }): () => void;
}
