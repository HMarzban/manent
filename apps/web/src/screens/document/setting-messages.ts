// What the message slot says of a script setting's change: made here, with its Undo, or arriving from another person.
import { SETTINGS } from "@manent/settings";
import type { SettingKey, SettingValue, SettingsStore } from "@manent/settings";
import { DOCUMENT_WORDS, READOUT_WORDS, messageFor } from "@manent/ui";
import { useEffect } from "react";
import { useServices } from "../../services/context.tsx";
import type { DocumentServices, PersonServices } from "../../services/ports.ts";
import type { PersonPresent } from "../../state/people.store.ts";

const SCRIPT_KEYS: ReadonlySet<string> = new Set(
  SETTINGS.all.filter((def) => def.scope === "script").map((def) => def.key),
);
const isScriptKey = (key: string): key is SettingKey => SCRIPT_KEYS.has(key);

const nounOf = (key: SettingKey): string => {
  const def = SETTINGS.get(key);
  return def.noun ?? def.label;
};

/** How a value is named: a choice by its label; a switch "On" or "Off" in a row, "on" or "off" in a message. */
export function valueLabel(
  key: SettingKey,
  value: unknown,
  inMessage: "row" | "message",
): string {
  const { choices } = SETTINGS.get(key).type;
  if (choices !== null)
    return choices.find((choice) => choice.value === value)?.label ?? "";
  if (inMessage === "message")
    return value === true ? DOCUMENT_WORDS.switchOn : DOCUMENT_WORDS.switchOff;
  return value === true ? READOUT_WORDS.valueOn : READOUT_WORDS.valueOff;
}

/** The name of `userId` among the people present; null for anyone else. */
export const nameOf = (
  people: readonly PersonPresent[],
  userId: string | null,
): string | null =>
  people.find((person) => person.userId === userId)?.name ?? null;

/** The script's store, saying each change or reset of one key made through it, with an Undo that sets the value it replaced back. */
export function announcing(
  store: SettingsStore,
  services: Pick<PersonServices, "messages" | "reverses">,
): SettingsStore {
  const announce = (
    key: SettingKey,
    before: SettingValue<SettingKey>,
  ): void => {
    const after = store.get(key);
    if (Object.is(after, before)) return;
    const message = messageFor({
      kind: "setting_changed",
      byName: null,
      noun: nounOf(key),
      valueLabel: valueLabel(key, after, "message"),
      pagesBefore: null,
      pagesAfter: null,
    });
    // put back through the store itself, so the undo says nothing of its own
    services.reverses.set(message.id, () => store.set(key, before));
    services.messages.push(message);
  };
  return {
    get: (key) => store.get(key),
    explain: (key) => store.explain(key),
    set(key, value) {
      const before = store.get(key);
      const result = store.set(key, value);
      if (result.ok) announce(key, before);
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
}

/** While `doc` is shown, a script setting another person changed is said in the message slot with their name. */
export function useRemoteSettingMessages(doc: DocumentServices): void {
  const { messages, userId } = useServices();
  useEffect(
    () =>
      doc.scriptBag.subscribe((keys, origin) => {
        if (origin !== "remote") return;
        for (const key of keys.filter(isScriptKey)) {
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
