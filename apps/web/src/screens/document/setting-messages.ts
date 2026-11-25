// What the message slot says of a script setting's change: made here, with its Undo, or arriving from another person.
import { SETTINGS } from "@manent/settings";
import type { SettingKey, SettingValue, SettingsStore } from "@manent/settings";
import {
  DOCUMENT_WORDS,
  LAYOUT_SETTINGS_WORDS,
  formatSettingValue,
  messageFor,
} from "@manent/ui";
import type { Message } from "@manent/ui";
import { useEffect } from "react";
import { useServices } from "../../services/context.tsx";
import type { DocumentServices, PersonServices } from "../../services/ports.ts";
import type { PersonPresent } from "../../state/people.store.ts";

const SCRIPT_KEYS: ReadonlySet<string> = new Set(
  SETTINGS.all.filter((def) => def.scope === "script").map((def) => def.key),
);
const isScriptKey = (key: string): key is SettingKey => SCRIPT_KEYS.has(key);

// an element style, header slots, labels or fields are said by the feature whose row sets them
const isSaidHere = (key: SettingKey): boolean => {
  const { kind } = SETTINGS.get(key).type;
  return (
    kind === "boolean" ||
    kind === "choice" ||
    kind === "number" ||
    kind === "text"
  );
};

const nounOf = (key: SettingKey): string => {
  const def = SETTINGS.get(key);
  return def.noun ?? def.label;
};

interface EnginePageDelta {
  readonly pagesBefore: number;
  readonly pagesAfter: number;
}

const pendingPageDeltas = new WeakMap<SettingsStore, EnginePageDelta>();

/** Records the before/after page counts for the next local `script.engineVersion` change through `store`. */
export function recordEnginePageDelta(
  store: SettingsStore,
  pagesBefore: number,
  pagesAfter: number,
): void {
  pendingPageDeltas.set(store, { pagesBefore, pagesAfter });
}

/** How a value is named: as its row names it, but a switch "on" or "off" in a message. */
export function valueLabel(
  key: SettingKey,
  value: unknown,
  inMessage: "row" | "message",
): string {
  if (inMessage === "message" && SETTINGS.get(key).type.kind === "boolean")
    return value === true ? DOCUMENT_WORDS.switchOn : DOCUMENT_WORDS.switchOff;
  if (key === "script.linesPerPage" && value === null)
    return LAYOUT_SETTINGS_WORDS.theFormatsFigure;
  return formatSettingValue(key, value);
}

/** The name of `userId` among the people present; null for anyone else. */
export const nameOf = (
  people: readonly PersonPresent[],
  userId: string | null,
): string | null =>
  people.find((person) => person.userId === userId)?.name ?? null;

function localSettingMessage(
  key: SettingKey,
  after: unknown,
  delta: EnginePageDelta | undefined,
): Message {
  const label = valueLabel(key, after, "message");
  if (key === "script.sceneNumbers") {
    return {
      id: "setting_changed",
      text: LAYOUT_SETTINGS_WORDS.sceneNumbersNow(label),
      actions: [
        { label: LAYOUT_SETTINGS_WORDS.undo, commandId: "settings.undo" },
      ],
      lifetime: "reverse",
      ownWork: false,
    };
  }
  return messageFor({
    kind: "setting_changed",
    byName: null,
    noun: nounOf(key),
    valueLabel: label,
    pagesBefore: delta?.pagesBefore ?? null,
    pagesAfter: delta?.pagesAfter ?? null,
  });
}

/** The script's store, saying each change or reset of one key made through it, with an Undo that sets the value it replaced back. */
export function announcing(
  store: SettingsStore,
  services: Pick<PersonServices, "messages" | "reverses">,
): SettingsStore {
  const announce = (
    key: SettingKey,
    before: SettingValue<SettingKey>,
    delta?: EnginePageDelta,
  ): void => {
    const after = store.get(key);
    if (Object.is(after, before) || !isSaidHere(key)) return;
    const message = localSettingMessage(key, after, delta);
    // put back through the store itself, so the undo says nothing of its own
    services.reverses.set(message.id, () => store.set(key, before));
    services.messages.push(message);
  };
  const wrapped: SettingsStore = {
    get: (key) => store.get(key),
    explain: (key) => store.explain(key),
    set(key, value) {
      const delta =
        key === "script.engineVersion"
          ? pendingPageDeltas.get(wrapped)
          : undefined;
      if (delta !== undefined) pendingPageDeltas.delete(wrapped);
      const before = store.get(key);
      const result = store.set(key, value);
      if (result.ok) announce(key, before, delta);
      return result;
    },
    hold: (key) => store.hold(key),
    reset(target) {
      if (typeof target !== "string") return store.reset(target);
      const before = store.get(target);
      const receipt = store.reset(target);
      announce(target, before);
      return receipt;
    },
    restore: (receipt) => store.restore(receipt),
    subscribe: (key, listener) => store.subscribe(key, listener),
    modified: (scope) => store.modified(scope),
  };
  return wrapped;
}

/** While `doc` is shown, a script setting another person changed is said in the message slot with their name. */
export function useRemoteSettingMessages(doc: DocumentServices): void {
  const { messages, userId } = useServices();
  useEffect(
    () =>
      doc.scriptBag.subscribe((keys, origin) => {
        if (origin !== "remote") return;
        for (const key of keys.filter(isScriptKey).filter(isSaidHere)) {
          const by = doc.scriptBag.provenance(key)?.byUserId ?? null;
          const byName = by === userId ? null : nameOf(doc.people.get(), by);
          const parsed = SETTINGS.get(key).type.parse(
            doc.scriptBag.read()[key],
          );
          // a person not present here cannot be named, and a value this build cannot read cannot be said
          if (byName === null || !parsed.ok) continue;
          messages.push(
            messageFor({
              kind: "setting_changed",
              byName,
              noun: nounOf(key),
              valueLabel: valueLabel(key, parsed.value, "message"),
              pagesBefore: null,
              pagesAfter: null,
            }),
          );
        }
      }),
    [doc, messages, userId],
  );
}
