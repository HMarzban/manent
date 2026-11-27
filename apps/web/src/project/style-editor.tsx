// Project settings' Element style card: compact collapsible rows with real format defaults, changed count and Undo.
import { SETTINGS } from "@manent/settings";
import type { ElementStyle } from "@manent/settings";
import {
  Button,
  PROJECT_WORDS,
  SHARING_WORDS,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import type { Message } from "@manent/ui";
import type { ReactNode } from "react";
import { useProjectItem } from "../screens/project-settings/project-data.ts";
import type { ProjectSettingRowProps } from "../screens/project-settings/project-setting-rows.ts";
import { useServices } from "../services/context.tsx";
import { SettingsCard } from "../settings-shell/settings-card.tsx";
import {
  EMPTY_ENTRY,
  elementsFor,
  entryHasVisibleChanges,
  entryIsEmpty,
} from "./style-defaults.ts";
import type { StyleElement, StyleMap } from "./style-defaults.ts";
import { StyleElementRow } from "./style-element-row.tsx";

/** Per-element progressive-disclosure style card for `project.style` under Project settings → Format and style. */
export function ElementStyleRow(props: ProjectSettingRowProps): ReactNode {
  const { settingKey, projectId } = props;
  const services = useServices();
  const store = useSettingsStore();
  const style = useSetting("project.style");
  const template = useSetting("project.template");
  const { writable } = store.explain(settingKey);
  const project = useProjectItem(projectId);
  const elements = elementsFor(template, project?.kind ?? null);

  const changedCount = elements.filter((element) =>
    entryHasVisibleChanges(style[element.key] ?? EMPTY_ENTRY),
  ).length;

  const commit = (
    element: StyleElement,
    nextEntry: ElementStyle | null,
  ): void => {
    const previous: StyleMap = store.get("project.style");
    const next: Record<string, ElementStyle> = { ...previous };
    if (nextEntry === null || entryIsEmpty(nextEntry)) delete next[element.key];
    else next[element.key] = nextEntry;
    const result = store.set("project.style", next);
    if (!result.ok) return;
    const message: Message = {
      id: `project_style_${element.key}`,
      text: PROJECT_WORDS.ownStyleChanged(element.label, null),
      actions: [{ label: SHARING_WORDS.undo, commandId: "settings.undo" }],
      lifetime: "reverse",
      ownWork: false,
    };
    services.reverses.set(message.id, () =>
      store.set("project.style", previous),
    );
    services.messages.push(message);
  };

  const resetAll = (): void => {
    const previous: StyleMap = store.get("project.style");
    const result = store.set("project.style", {});
    if (!result.ok) return;
    const message: Message = {
      id: "project_style_all",
      text: PROJECT_WORDS.ownStyleChanged(SETTINGS.get(settingKey).label, null),
      actions: [{ label: SHARING_WORDS.undo, commandId: "settings.undo" }],
      lifetime: "reverse",
      ownWork: false,
    };
    services.reverses.set(message.id, () =>
      store.set("project.style", previous),
    );
    services.messages.push(message);
  };

  return (
    <SettingsCard
      divided
      data-tour={`setting:${settingKey}`}
      title={SETTINGS.get(settingKey).label}
      badge={
        changedCount === 0 ? null : (
          <span className="mn-tag tabular-nums">
            {PROJECT_WORDS.styleChangedCount(changedCount)}
          </span>
        )
      }
      action={
        changedCount > 0 && writable ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto cursor-pointer p-0 text-meta"
            onClick={resetAll}
          >
            {PROJECT_WORDS.styleResetAll}
          </Button>
        ) : undefined
      }
    >
      {elements.map((element) => {
        const entry = style[element.key] ?? EMPTY_ENTRY;
        return (
          <StyleElementRow
            key={element.key}
            element={element}
            entry={entry}
            disabled={!writable}
            onChange={(next) => commit(element, next)}
            onReset={() => commit(element, null)}
          />
        );
      })}
    </SettingsCard>
  );
}
