// What Script settings draws beyond a plain setting row: a feature's own row for a setting, or a line it says under
// every row; a feature adds its line here.
import type { SettingKey } from "@manent/settings";
import type { ComponentType } from "react";
import { FrozenRow } from "../../production/frozen-row.tsx";
import { HeaderFooterRow } from "./header-footer-row.tsx";

export interface ScriptSettingRowProps {
  readonly settingKey: SettingKey;
  readonly docId: string;
}

/**
 * `custom`: the row drawn for `settingKey` in place of the plain one. `state`: drawn under every row, after who set
 * it, in list order; it draws nothing for a row it has nothing to say about.
 */
export type ScriptSettingRow =
  | {
      readonly kind: "custom";
      readonly settingKey: SettingKey;
      readonly Row: ComponentType<ScriptSettingRowProps>;
    }
  | {
      readonly kind: "state";
      readonly id: string;
      readonly State: ComponentType<ScriptSettingRowProps>;
    };

export const SCRIPT_SETTING_ROWS: readonly ScriptSettingRow[] = [
  { kind: "state", id: "frozen", State: FrozenRow },
  { kind: "custom", settingKey: "script.header", Row: HeaderFooterRow },
  { kind: "custom", settingKey: "script.footer", Row: HeaderFooterRow },
];
