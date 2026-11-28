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
import { useContext, useEffect } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices, PersonServices } from "../../services/ports.ts";
import { FactsContext } from "../../state/bridge-contexts.ts";
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

/** How long to wait for the paginator's next page count before saying a remote change without a page delta. */
const PAGE_DELTA_WAIT_MS = 200;

/** What a sentence calls a person: the first of their names ("Sam" for "Sam Okafor"). */
const firstNameOf = (name: string): string => name.split(" ")[0] ?? name;

/** While `doc` is shown, a script setting another person changed is said in the message slot with their name. */
export function useRemoteSettingMessages(doc: DocumentServices): void {
  const { messages, userId } = useServices();
  const { schedule } = useEnvironment();
  const facts = useContext(FactsContext);
  useEffect(() => {
    const cleanups = new Set<() => void>();
    const stop = doc.scriptBag.subscribe((keys, origin) => {
      if (origin !== "remote") return;
      for (const key of keys.filter(isScriptKey).filter(isSaidHere)) {
        const by = doc.scriptBag.provenance(key)?.byUserId ?? null;
        const fullName = by === userId ? null : nameOf(doc.people.get(), by);
        const parsed = SETTINGS.get(key).type.parse(doc.scriptBag.read()[key]);
        // a person not present here cannot be named, and a value this build cannot read cannot be said
        if (fullName === null || !parsed.ok) continue;
        const byName = firstNameOf(fullName);
        const noun = nounOf(key);
        const label = valueLabel(key, parsed.value, "message");
        const pagesBefore = facts?.get("pageCount") ?? null;
        const push = (before: number | null, after: number | null): void => {
          messages.push(
            messageFor({
              kind: "setting_changed",
              byName,
              noun,
              valueLabel: label,
              pagesBefore: before,
              pagesAfter: after,
            }),
          );
        };
        push(null, null);
        if (facts === null || pagesBefore === null) continue;
        let settled = false;
        let stopPages: (() => void) | null = null;
        let cancelTimer: (() => void) | null = null;
        const stopWaiting = (): void => {
          if (settled) return;
          settled = true;
          stopPages?.();
          cancelTimer?.();
          cleanups.delete(stopWaiting);
        };
        cleanups.add(stopWaiting);
        stopPages = facts.subscribe("pageCount", (after) => {
          if (after === null || after === pagesBefore) return;
          stopWaiting();
          messages.withdraw("setting_changed");
          push(pagesBefore, after);
        });
        cancelTimer = schedule(stopWaiting, PAGE_DELTA_WAIT_MS);
      }
    });
    return () => {
      stop();
      for (const cancel of cleanups) cancel();
      cleanups.clear();
    };
  }, [doc, facts, messages, schedule, userId]);
}
