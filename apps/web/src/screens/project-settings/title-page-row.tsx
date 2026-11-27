// The Title page card: responsive two-column grid of title page fields, each written once it is left.
import { SETTINGS } from "@manent/settings";
import { EDITOR_WORDS, useSetting, useSettingsStore } from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";
import { CommitField } from "./commit-field.tsx";

const FIELDS = Object.freeze(
  Object.keys(EDITOR_WORDS.titlePage).filter(
    (name): name is keyof typeof EDITOR_WORDS.titlePage =>
      Object.hasOwn(EDITOR_WORDS.titlePage, name),
  ),
);

export function TitlePageRow(): ReactNode {
  const store = useSettingsStore();
  const value = useSetting("project.titlePage");
  const { writable } = store.explain("project.titlePage");
  const labelId = useId();
  return (
    <SettingsCard title={SETTINGS.get("project.titlePage").label}>
      <div
        role="group"
        aria-labelledby={labelId}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <span id={labelId} className="sr-only">
          {SETTINGS.get("project.titlePage").label}
        </span>
        {FIELDS.map((name) => (
          <div key={name} className="flex min-w-0 flex-col gap-1.5">
            <span
              aria-hidden="true"
              className="text-meta font-medium text-fg-muted"
            >
              {EDITOR_WORDS.titlePage[name]}
            </span>
            <CommitField
              className="w-full"
              value={value[name] ?? ""}
              label={EDITOR_WORDS.titlePage[name]}
              disabled={!writable}
              onCommit={(typed) =>
                store.set("project.titlePage", { ...value, [name]: typed })
              }
            />
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
