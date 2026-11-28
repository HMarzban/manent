// The rows Project settings draws in place of a plain setting row; a feature adds its row here with one line.
import type { SettingKey } from "@manent/settings";
import type { ComponentType } from "react";
import { ElementStyleRow } from "../../project/style-editor.tsx";
import { ReadRateRow } from "../../timing/read-rate-row.tsx";
import { HeaderFooterRow } from "../document/header-footer-row.tsx";
import { ActsRow, LadderRow } from "./label-list-row.tsx";
import { TemplateRow } from "./template-row.tsx";
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
  { settingKey: "project.template", Row: TemplateRow },
  { settingKey: "project.style", Row: ElementStyleRow },
  { settingKey: "project.titlePage", Row: TitlePageRow },
  { settingKey: "project.acts", Row: ActsRow },
  { settingKey: "project.ladder", Row: LadderRow },
  { settingKey: "project.header", Row: HeaderFooterRow },
  { settingKey: "project.footer", Row: HeaderFooterRow },
  { settingKey: "project.readRate", Row: ReadRateRow },
];
