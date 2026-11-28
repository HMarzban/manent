// Who last changed a project setting, shown beneath the setting row when set by another person.
import { demoPersonName } from "@manent/demo";
import { SETTINGS } from "@manent/settings";
import type { SettingKey } from "@manent/settings";
import {
  DOCUMENT_WORDS,
  formatDate,
  formatSettingValue,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectPerson } from "./project-data.ts";

/** Resolves `userId` to a display name from the project's people list, falling back to demo names; null if unknown. */
export function projectPersonName(
  people: readonly ProjectPerson[],
  userId: string | null,
): string | null {
  if (userId === null) return null;
  return (
    people.find((person) => person.userId === userId)?.name ??
    demoPersonName(userId) ??
    null
  );
}

/** First name of a person for brief sentences ("Dana"). */
export function projectFirstName(
  people: readonly ProjectPerson[],
  userId: string | null,
): string | null {
  const full = projectPersonName(people, userId);
  if (full === null) return null;
  return full.split(" ")[0] ?? full;
}

/** Formats a stored project setting value for provenance lines and remote-change messages. */
export function formatProjectValue(key: SettingKey, value: unknown): string {
  const formatted = formatSettingValue(key, value);
  if (formatted !== "") return formatted;
  if (Array.isArray(value)) {
    const labels = value.filter(
      (item): item is string => typeof item === "string",
    );
    return labels.length > 0 ? labels.join(", ") : "";
  }
  return "";
}

/** Renders `"Set by <name> <date> · was <prev>"` when another person last changed `settingKey`. */
export function ProjectSetBy(props: {
  readonly settingKey: SettingKey;
  readonly people: readonly ProjectPerson[];
  readonly inset?: boolean;
}): ReactNode {
  const { settingKey, people, inset = true } = props;
  const { userId } = useServices();
  const { now } = useEnvironment();
  const store = useSettingsStore();
  useSetting(settingKey);
  const { provenance } = store.explain(settingKey);
  const by = provenance?.byUserId ?? null;
  const name = by === userId ? null : projectPersonName(people, by);
  if (provenance === null || name === null) return null;
  const was = provenance.was ?? SETTINGS.get(settingKey).default;
  const wasLabel = formatProjectValue(settingKey, was);
  if (wasLabel === "") return null;
  return (
    <p
      data-project-provenance={settingKey}
      className={
        inset
          ? "-mt-2 px-4 pb-3 text-meta text-fg-muted"
          : "px-1 text-meta text-fg-muted"
      }
    >
      {DOCUMENT_WORDS.setBy(name, formatDate(provenance.at ?? now()), wasLabel)}
    </p>
  );
}
