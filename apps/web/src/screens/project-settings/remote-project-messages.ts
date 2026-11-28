// Calm remote project-setting toast when another owner changes a project setting while Project settings is open.
import { SETTINGS } from "@manent/settings";
import type { Bag, ElementStyle, SettingKey } from "@manent/settings";
import { DOCUMENT_WORDS, PROJECT_WORDS, messageFor } from "@manent/ui";
import type { Message, MessageQueue } from "@manent/ui";
import { useEffect } from "react";
import { PROJECT_SETTING_KEYS } from "../../project/settings-bag.ts";
import { elementsFor } from "../../project/style-defaults.ts";
import type { ProjectKind } from "../../services/ports.ts";
import type { ProjectPerson } from "./project-data.ts";
import { formatProjectValue, projectFirstName } from "./project-set-by.tsx";

const PROJECT_KEYS_SET: ReadonlySet<string> = new Set(PROJECT_SETTING_KEYS);
const isProjectKey = (key: string): key is SettingKey =>
  PROJECT_KEYS_SET.has(key);

const isScalarProjectKey = (key: SettingKey): boolean => {
  const { kind } = SETTINGS.get(key).type;
  return (
    kind === "boolean" ||
    kind === "choice" ||
    kind === "number" ||
    kind === "text"
  );
};

function changedStyleElementLabel(
  before: unknown,
  after: unknown,
  template: unknown,
  projectKind: ProjectKind | null,
): string {
  const prev =
    typeof before === "object" && before !== null
      ? (before as Readonly<Record<string, ElementStyle>>)
      : {};
  const next =
    typeof after === "object" && after !== null
      ? (after as Readonly<Record<string, ElementStyle>>)
      : {};
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed = [...allKeys].filter(
    (k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null),
  );
  if (changed.length === 1) {
    const templateId = typeof template === "string" ? template : "screenplay";
    const match = elementsFor(templateId, projectKind).find(
      (element) => element.key === changed[0],
    );
    if (match !== undefined) return match.label;
  }
  return SETTINGS.get("project.style").label;
}

/** Builds the calm brief toast for a remote project-setting change by another owner, or null when unsayable. */
export function remoteProjectSettingMessage(options: {
  readonly key: SettingKey;
  readonly byName: string;
  readonly value: unknown;
  readonly previous: unknown;
  readonly projectTitle: string | null;
  readonly projectKind: ProjectKind | null;
  readonly template: unknown;
}): Message | null {
  const { key, byName, value, previous, projectTitle, projectKind, template } =
    options;
  const def = SETTINGS.get(key);
  const parsed = def.type.parse(value);
  if (!parsed.ok) return null;

  if (key === "project.style") {
    const elementLabel = changedStyleElementLabel(
      previous,
      parsed.value,
      template,
      projectKind,
    );
    if (projectTitle !== null) {
      return {
        id: "project_setting_changed",
        text: PROJECT_WORDS.otherStyleChanged(
          byName,
          elementLabel,
          projectTitle,
          null,
        ),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      };
    }
    return null;
  }

  if (!isScalarProjectKey(key)) return null;
  const valueLabel =
    def.type.kind === "boolean"
      ? parsed.value === true
        ? DOCUMENT_WORDS.switchOn
        : DOCUMENT_WORDS.switchOff
      : formatProjectValue(key, parsed.value);
  if (valueLabel === "") return null;

  const noun = def.noun ?? def.label;
  if (projectTitle !== null) {
    return {
      id: "project_setting_changed",
      text: PROJECT_WORDS.otherSettingChanged(
        byName,
        noun,
        valueLabel,
        projectTitle,
      ),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    };
  }
  return {
    ...messageFor({
      kind: "setting_changed",
      byName,
      noun,
      valueLabel,
      pagesBefore: null,
      pagesAfter: null,
    }),
    id: "project_setting_changed",
    actions: [],
  };
}

/** Announces remote project-setting changes made by another owner while Project settings is open. */
export function useRemoteProjectSettingMessages(options: {
  readonly bag: Bag;
  readonly projectTitle: string | null;
  readonly projectKind: ProjectKind | null;
  readonly people: readonly ProjectPerson[];
  readonly userId: string;
  readonly messages: MessageQueue;
}): void {
  const { bag, projectTitle, projectKind, people, userId, messages } = options;

  useEffect(() => {
    let prevValues: Readonly<Record<string, unknown>> = bag.read();
    const seenAt = new Map<string, number | null>();
    for (const key of PROJECT_SETTING_KEYS) {
      const prov = bag.provenance(key);
      if (prov !== null) seenAt.set(key, prov.at);
    }

    return bag.subscribe((keys, origin) => {
      const current = bag.read();
      if (origin !== "remote" || keys === PROJECT_SETTING_KEYS) {
        prevValues = current;
        for (const key of keys) {
          const prov = bag.provenance(key);
          if (prov !== null) seenAt.set(key, prov.at);
        }
        return;
      }
      for (const key of keys.filter(isProjectKey)) {
        const prov = bag.provenance(key);
        const by = prov?.byUserId ?? null;
        if (by === null || by === userId) continue;
        if (prov !== null && prov.at !== null && seenAt.get(key) === prov.at)
          continue;
        const byName = projectFirstName(people, by);
        if (byName === null) continue;
        const msg = remoteProjectSettingMessage({
          key,
          byName,
          value: current[key],
          previous: prevValues[key],
          projectTitle,
          projectKind,
          template: current["project.template"],
        });
        if (prov !== null) seenAt.set(key, prov.at);
        if (msg !== null) {
          messages.withdraw(msg.id);
          messages.push(msg);
        }
      }
      prevValues = current;
    });
  }, [bag, projectTitle, projectKind, people, userId, messages]);
}
