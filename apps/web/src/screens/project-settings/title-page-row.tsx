// The Title page row: one field per title page field, each written once it is left.
import { SETTINGS } from "@manent/settings";
import { EDITOR_WORDS, useSetting, useSettingsStore } from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
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
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-2 py-1"
    >
      <span id={labelId} className="text-ui font-medium">
        {SETTINGS.get("project.titlePage").label}
      </span>
      {FIELDS.map((name) => (
        <div key={name} className="flex items-center justify-between gap-4">
          <span aria-hidden="true" className="text-ui text-fg-muted">
            {EDITOR_WORDS.titlePage[name]}
          </span>
          <CommitField
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
  );
}
