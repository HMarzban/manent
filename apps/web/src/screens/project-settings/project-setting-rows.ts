// The rows Project settings draws in place of a plain setting row; a feature adds its row here with one line.
import type { SettingKey } from "@manent/settings";
import type { ComponentType } from "react";
import { ActsRow, LadderRow } from "./label-list-row.tsx";
import { TitlePageRow } from "./title-page-row.tsx";

export interface ProjectSettingRowProps {
  readonly settingKey: SettingKey;
  readonly projectId: string;
}

export interface ProjectSettingRow {
  readonly settingKey: SettingKey;
  readonly Row: ComponentType<ProjectSettingRowProps>;
}

export const PROJECT_SETTING_ROWS: readonly ProjectSettingRow[] = [
  { settingKey: "project.titlePage", Row: TitlePageRow },
  { settingKey: "project.acts", Row: ActsRow },
  { settingKey: "project.ladder", Row: LadderRow },
];
