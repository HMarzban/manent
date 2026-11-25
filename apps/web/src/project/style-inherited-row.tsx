// Script settings' inherited project-setting line and read-only Element style row.
import { SETTINGS, projectTwinOf } from "@manent/settings";
import type { ElementStyle, SettingKey } from "@manent/settings";
import {
  Button,
  PROJECT_WORDS,
  useSetting,
  useSettingsStore,
  useSubscribable,
} from "@manent/ui";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { editorWords } from "../editor-host/editor-words.ts";
import type { ScriptSettingRowProps } from "../screens/document/script-setting-rows.ts";
import { useProjectItem } from "../screens/project-settings/project-data.ts";
import { useServices } from "../services/context.tsx";
import { useProductionContext } from "../state/production-context.store.ts";

const EMPTY_STYLE: Readonly<Record<string, ElementStyle>> = Object.freeze({});
const NO_KIND = Object.freeze({
  get: () => null,
  subscribe: () => () => {},
});

function hasAnyField(style: ElementStyle): boolean {
  return (
    style.capitalized !== null ||
    style.spaceBefore !== null ||
    style.indent !== null ||
    style.width !== null ||
    style.underlined !== null ||
    style.bold !== null ||
    style.colour !== null
  );
}

function asSettingKey(key: string): SettingKey | null {
  return SETTINGS.all.find((held) => held.key === key)?.key ?? null;
}

function useInheritedProjectTitle(
  settingKey: SettingKey,
  docId: string,
): string | null {
  const services = useServices();
  const store = useSettingsStore();
  const locked = useProductionContext(docId)?.locked === true;
  const twin = projectTwinOf(settingKey);
  const twinKey = twin === null ? null : asSettingKey(twin);
  const projectSource = useMemo(
    () => services.library.documentProject(docId),
    [services, docId],
  );
  const projectId = useSubscribable(projectSource);
  const project = useProjectItem(projectId ?? "");
  // Subscribe to both the twin and project.style so emptiness checks stay current without violating Hook order.
  useSetting(twinKey ?? "project.template");
  const projectStyle = useSetting("project.style");
  if (locked || twinKey === null || projectId === null || project === null)
    return null;
  if (store.explain(twinKey).source !== "own") return null;
  if (twinKey === "project.style" && Object.keys(projectStyle).length === 0)
    return null;
  return project.title;
}

/** Shown when `script.style` is inherited from its project or when page numbers are locked. */
export function ScriptStyleRow(props: ScriptSettingRowProps): ReactNode {
  const { settingKey, docId } = props;
  const services = useServices();
  const store = useSettingsStore();
  const locked = useProductionContext(docId)?.locked === true;
  const style = useSetting("script.style");
  const format = useSetting("script.format");
  const kindSource = useMemo(
    () => services.library.documentKind(docId) ?? NO_KIND,
    [services, docId],
  );
  const kind = useSubscribable(kindSource);
  const projectSource = useMemo(
    () => services.library.documentProject(docId),
    [services, docId],
  );
  const projectId = useSubscribable(projectSource);
  const projectStyle = useSetting("project.style");
  const hasProjectStyle =
    projectId !== null &&
    store.explain("project.style").source === "own" &&
    Object.keys(projectStyle).length > 0;
  const styledEntries = Object.entries(style).filter(([, entry]) =>
    hasAnyField(entry),
  );
  if (!locked && !hasProjectStyle && styledEntries.length === 0) return null;
  const words = editorWords(kind);
  const labels = styledEntries.map(([key]) => {
    const [type, breakKind] = key.startsWith("act_break.")
      ? ["act_break", key.slice("act_break.".length)]
      : [key, null];
    return words.element(format, type, breakKind);
  });
  const summary =
    labels.length > 0 ? labels.join(", ") : PROJECT_WORDS.styleAsFormat;
  return (
    <div
      data-tour={`setting:${settingKey}`}
      className="flex min-h-row items-center justify-between gap-x-4 py-1"
    >
      <span className="text-ui font-medium">
        {SETTINGS.get(settingKey).label}
      </span>
      <span className="truncate text-meta text-fg-muted">{summary}</span>
    </div>
  );
}

/** Under each Script setting followed from the project while unlocked, names the project and opens Project settings. */
export function InheritedRow(props: ScriptSettingRowProps): ReactNode {
  const { settingKey, docId } = props;
  const services = useServices();
  const title = useInheritedProjectTitle(settingKey, docId);
  if (title === null) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
      <span>{PROJECT_WORDS.fromProjectSettings(title)}</span>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-meta"
        onClick={() => services.commands.run("project.openSettings", "control")}
      >
        {PROJECT_WORDS.openProjectSettings}
      </Button>
    </p>
  );
}

export { EMPTY_STYLE };
