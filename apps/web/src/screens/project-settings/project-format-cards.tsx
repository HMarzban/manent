// Format and style cards and per-row wrapper (with Set by provenance) for Project settings.
import { SETTINGS } from "@manent/settings";
import type { ProjectGroup, SettingKey } from "@manent/settings";
import { SettingRow } from "@manent/ui";
import type { ReactNode } from "react";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";
import type { ProjectPerson } from "./project-data.ts";
import { ProjectSetBy } from "./project-set-by.tsx";
import { PROJECT_SETTING_ROWS } from "./project-setting-rows.ts";

/** The settings `group` draws, in their order. */
export const projectGroupKeys = (group: ProjectGroup): readonly SettingKey[] =>
  SETTINGS.all
    .flatMap((def) =>
      def.surfaces.flatMap((surface) =>
        surface.in === "projectSettings" && surface.group === group
          ? [{ key: def.key, order: surface.order }]
          : [],
      ),
    )
    .toSorted((a, b) => a.order - b.order)
    .map(({ key }) => key);

const FORMAT_KEYS = Object.freeze(projectGroupKeys("format_style"));

const HEADER_FOOTER_KEYS: ReadonlySet<SettingKey> = new Set([
  "project.header",
  "project.footer",
]);

const STANDALONE_CARD_KEYS: ReadonlySet<SettingKey> = new Set([
  "project.style",
  "project.titlePage",
]);

/** One setting row inside a card: a custom feature row, else SettingRow with card-row padding, plus Set by provenance. */
export function ProjectRow(props: {
  readonly settingKey: SettingKey;
  readonly projectId: string;
  readonly people: readonly ProjectPerson[];
}): ReactNode {
  const { settingKey, projectId, people } = props;
  const own = PROJECT_SETTING_ROWS.find((row) => row.settingKey === settingKey);
  const standalone = STANDALONE_CARD_KEYS.has(settingKey);
  const body =
    own !== undefined ? (
      HEADER_FOOTER_KEYS.has(settingKey) ? (
        <div className="px-4 py-3">
          <own.Row settingKey={settingKey} projectId={projectId} />
        </div>
      ) : (
        <own.Row settingKey={settingKey} projectId={projectId} />
      )
    ) : (
      <SettingRow cardRow settingKey={settingKey} deviceName={null} persisted />
    );
  if (standalone) return body;
  return (
    <div>
      {body}
      <ProjectSetBy settingKey={settingKey} people={people} />
    </div>
  );
}

/** Organises Format and style cleanly into calm sibling cards: Template, Element style, Title page, Header & footer, and defaults. */
export function FormatAndStyleCards(props: {
  readonly projectId: string;
  readonly people: readonly ProjectPerson[];
}): ReactNode {
  const { projectId, people } = props;
  const templateKey = FORMAT_KEYS.find((k) => k === "project.template");
  const styleKey = FORMAT_KEYS.find((k) => k === "project.style");
  const titlePageKey = FORMAT_KEYS.find((k) => k === "project.titlePage");
  const headerFooterKeys = FORMAT_KEYS.filter((k) => HEADER_FOOTER_KEYS.has(k));
  const otherKeys = FORMAT_KEYS.filter(
    (k) =>
      k !== "project.template" &&
      !STANDALONE_CARD_KEYS.has(k) &&
      !HEADER_FOOTER_KEYS.has(k),
  );
  return (
    <>
      {templateKey === undefined ? null : (
        <SettingsCard divided>
          <ProjectRow
            settingKey={templateKey}
            projectId={projectId}
            people={people}
          />
        </SettingsCard>
      )}
      {styleKey === undefined ? null : (
        <ProjectRow
          settingKey={styleKey}
          projectId={projectId}
          people={people}
        />
      )}
      {titlePageKey === undefined ? null : (
        <ProjectRow
          settingKey={titlePageKey}
          projectId={projectId}
          people={people}
        />
      )}
      {headerFooterKeys.length === 0 ? null : (
        <SettingsCard divided>
          {headerFooterKeys.map((key) => (
            <ProjectRow
              key={key}
              settingKey={key}
              projectId={projectId}
              people={people}
            />
          ))}
        </SettingsCard>
      )}
      {otherKeys.length === 0 ? null : (
        <SettingsCard divided>
          {otherKeys.map((key) => (
            <ProjectRow
              key={key}
              settingKey={key}
              projectId={projectId}
              people={people}
            />
          ))}
        </SettingsCard>
      )}
    </>
  );
}
