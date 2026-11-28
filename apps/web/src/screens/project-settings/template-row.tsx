// Project settings' Template row: shows a Custom indicator when Format, style or ladder rows diverge, and applies per-template defaults with Undo.
import { SETTINGS } from "@manent/settings";
import {
  Button,
  PREFERENCES_WORDS,
  PROJECT_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  messageFor,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import {
  applyTemplateSwitch,
  captureTemplateSnapshot,
  divergesFromTemplate,
  restoreTemplateSnapshot,
} from "../../project/template-defaults.ts";
import type { ProjectTemplate } from "../../project/template-defaults.ts";
import { useServices } from "../../services/context.tsx";
import { useProjectItem } from "./project-data.ts";
import type { ProjectSettingRowProps } from "./project-setting-rows.ts";

const EPISODE_KINDS: ReadonlySet<string> = new Set(["series", "podcast"]);

function choiceLabelOf(value: string): string {
  const choices = SETTINGS.get("project.template").type.choices ?? [];
  return choices.find((choice) => choice.value === value)?.label ?? value;
}

/** Custom row for `project.template` in Project settings → Format and style. */
export function TemplateRow(props: ProjectSettingRowProps): ReactNode {
  const { settingKey, projectId } = props;
  const services = useServices();
  const store = useSettingsStore();
  const project = useProjectItem(projectId);

  // Subscribe to template and every template-controlled key in fixed order so Custom detection updates immediately.
  const template = useSetting("project.template");
  useSetting("project.style");
  useSetting("project.header");
  useSetting("project.footer");
  useSetting("project.acts");
  useSetting("project.numbering");
  useSetting("project.colourOrder");
  useSetting("project.targetPages");
  useSetting("project.dateFormat");
  useSetting("project.ladder");

  const def = SETTINGS.get("project.template");
  const choices = def.type.choices ?? [];
  const explained = store.explain("project.template");
  const diverged = divergesFromTemplate(store);
  const templateLabel = choiceLabelOf(template);
  const customLabel = choiceLabelOf("custom");
  const helperLine =
    project !== null && EPISODE_KINDS.has(project.kind)
      ? PROJECT_WORDS.templateForEpisodes
      : PROJECT_WORDS.templateForScripts;

  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const differsId = `${id}-differs`;
  const describedBy = diverged ? `${helpId} ${differsId}` : helpId;

  const applyWithUndo = (next: ProjectTemplate): void => {
    const snapshot = captureTemplateSnapshot(store);
    if (!applyTemplateSwitch(store, next)) return;
    const message = messageFor({
      kind: "setting_changed",
      byName: null,
      noun: def.noun ?? def.label,
      valueLabel: choiceLabelOf(next),
      pagesBefore: null,
      pagesAfter: null,
    });
    services.messages.withdraw(message.id);
    services.reverses.set(message.id, () => {
      restoreTemplateSnapshot(store, snapshot);
      services.messages.withdraw(message.id);
    });
    services.messages.push(message);
  };

  const handleSelect = (chosen: string | null): void => {
    if (chosen === null) return;
    const parsed = def.type.parse(chosen);
    if (!parsed.ok) return;
    const next = parsed.value as ProjectTemplate;
    if (next === template && !diverged) return;
    applyWithUndo(next);
  };

  return (
    <div
      data-tour={`setting:${settingKey}`}
      className="flex min-h-row-2 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5">
          <span id={labelId} className="text-ui font-medium text-fg">
            {def.label}
          </span>
          {explained.modified || diverged ? (
            <span
              aria-hidden="true"
              className="mn-setting-dot size-1.5 shrink-0 rounded-full bg-primary"
            />
          ) : null}
          {diverged ? (
            <span data-template-custom="" className="mn-tag">
              {customLabel}
            </span>
          ) : null}
        </span>
        <p id={helpId} className="max-w-prose text-meta text-fg-muted">
          {helperLine}
        </p>
        {diverged ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p id={differsId} className="text-meta text-fg-muted">
              {PROJECT_WORDS.templateDiffers(templateLabel)}
            </p>
            {explained.writable ? (
              <Button
                variant="link"
                className="h-auto cursor-pointer p-0 text-meta"
                onClick={() => applyWithUndo(template)}
              >
                {PREFERENCES_WORDS.reset}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">
        <Select
          items={choices}
          value={template}
          onValueChange={handleSelect}
          disabled={!explained.writable}
        >
          <SelectTrigger
            aria-labelledby={labelId}
            aria-describedby={describedBy}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
