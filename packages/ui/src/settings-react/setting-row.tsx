// One setting's row, generated from its definition: the control, its help, its default and who set it. A value with no
// plain control (an element style, header slots, labels, fields) is drawn by a row of its own.
import { SETTINGS } from "@manent/settings";
import type { Choice, SettingKey, SettingValue } from "@manent/settings";
import { cn } from "cn";
import { useId, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Segmented } from "../components/segmented/segmented.tsx";
import { Button } from "../components/stock/button.tsx";
import { Input } from "../components/stock/input.tsx";
import {
  RadioGroup,
  RadioGroupItem,
} from "../components/stock/radio-group.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/stock/select.tsx";
import { Switch } from "../components/stock/switch.tsx";
import { PREFERENCES_WORDS } from "../words/preferences.ts";
import {
  NUMBER_WORDS,
  choiceLabel,
  defaultLine,
  formatSettingValue,
  setFrom,
} from "./setting-format.ts";
import { useSettingsStore } from "./settings-context.tsx";
import { useSetting } from "./use-setting.ts";

export { formatSettingValue };

// a choice of more options than this is a select
const RADIO_LIMIT = 4;
const SEGMENTED_KEYS: ReadonlySet<SettingKey> = new Set([
  "device.interfaceSize",
]);
// the theme's System choice also names what the system shows now
const SYSTEM_THEME = { key: "appearance.theme", value: "system" } as const;
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ControlProps {
  settingKey: SettingKey;
  value: SettingValue<SettingKey>;
  labelId: string;
  describedBy: string;
  disabled: boolean;
}

function subscribeToScheme(listener: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

const isSystemDark = (): boolean => window.matchMedia(DARK_QUERY).matches;

function SwitchControl({
  settingKey,
  value,
  labelId,
  describedBy,
  disabled,
}: ControlProps): ReactNode {
  const store = useSettingsStore();
  return (
    <Switch
      checked={value === true}
      onCheckedChange={(checked) => setFrom(store, settingKey, checked)}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      disabled={disabled}
    />
  );
}

function RadioControl({
  settingKey,
  value,
  labelId,
  describedBy,
  disabled,
}: ControlProps): ReactNode {
  const store = useSettingsStore();
  const dark = useSyncExternalStore(subscribeToScheme, isSystemDark);
  const id = useId();
  const choices = SETTINGS.get(settingKey).type.choices ?? [];
  const textOf = (choice: Choice<string>): string =>
    settingKey === SYSTEM_THEME.key && choice.value === SYSTEM_THEME.value
      ? PREFERENCES_WORDS.systemNow(
          choiceLabel(choices, dark ? "dark" : "light"),
        )
      : choice.label;
  return (
    <RadioGroup
      value={value}
      onValueChange={(chosen) => setFrom(store, settingKey, chosen)}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      disabled={disabled}
    >
      {choices.map((choice) => (
        <label
          key={choice.value}
          className={cn(
            "flex min-h-8 items-center gap-2 text-ui",
            disabled ? "cursor-not-allowed text-fg-disabled" : "cursor-pointer",
          )}
        >
          <RadioGroupItem
            value={choice.value}
            aria-labelledby={`${id}-${choice.value}`}
          />
          <span id={`${id}-${choice.value}`}>{textOf(choice)}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

function SelectControl({
  settingKey,
  value,
  labelId,
  describedBy,
  disabled,
}: ControlProps): ReactNode {
  const store = useSettingsStore();
  const choices = SETTINGS.get(settingKey).type.choices ?? [];
  return (
    <Select
      items={choices}
      value={String(value)}
      onValueChange={(chosen) => setFrom(store, settingKey, chosen)}
      disabled={disabled}
    >
      <SelectTrigger aria-labelledby={labelId} aria-describedby={describedBy}>
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
  );
}

function SegmentedControl({
  settingKey,
  value,
  disabled,
}: ControlProps): ReactNode {
  const store = useSettingsStore();
  const def = SETTINGS.get(settingKey);
  return (
    <Segmented
      label={def.label}
      value={String(value)}
      options={def.type.choices ?? []}
      disabled={disabled}
      onChange={(chosen) => setFrom(store, settingKey, chosen)}
    />
  );
}

/** How a field shows its value and reads what was typed; the setting's own type then accepts it or not. */
interface Field {
  type: "text" | "number";
  inputMode: "text" | "decimal";
  className: string;
  read(typed: string): unknown;
}

const TEXT_FIELD: Field = Object.freeze({
  type: "text",
  inputMode: "text",
  className: "w-full max-w-48",
  read: (typed: string) => typed,
});

// an empty number field is no value, which a setting that takes none accepts
const NUMBER_FIELD: Field = Object.freeze({
  type: "number",
  inputMode: "decimal",
  className: "w-20 tabular-nums",
  read: (typed: string) => (typed.trim() === "" ? null : Number(typed)),
});

/** A field that writes what was typed once it is left or Enter is pressed; Escape, or a value the setting refuses, puts the value back. */
function FieldControl(props: ControlProps & { field: Field }): ReactNode {
  const { settingKey, value, labelId, describedBy, disabled, field } = props;
  const store = useSettingsStore();
  // null while the field shows the stored value
  const [typed, setTyped] = useState<string | null>(null);
  const commit = (): void => {
    if (typed !== null) setFrom(store, settingKey, field.read(typed));
    setTyped(null);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setTyped(null);
  };
  return (
    <Input
      type={field.type}
      inputMode={field.inputMode}
      className={field.className}
      value={typed ?? (value === null ? "" : String(value))}
      // an empty number field is the setting's null, named as its row names it
      placeholder={NUMBER_WORDS[settingKey]?.none}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      disabled={disabled}
    />
  );
}

const TextControl = (props: ControlProps): ReactNode => (
  <FieldControl {...props} field={TEXT_FIELD} />
);
const NumberControl = (props: ControlProps): ReactNode => (
  <FieldControl {...props} field={NUMBER_FIELD} />
);

/** Null for a value no plain control can set. */
function controlFor(
  key: SettingKey,
): ((props: ControlProps) => ReactNode) | null {
  if (key === "appearance.projectPalettes") return null;
  const { kind, choices } = SETTINGS.get(key).type;
  if (kind === "boolean") return SwitchControl;
  if (kind === "text") return TextControl;
  if (kind === "number") return NumberControl;
  if (choices === null) return null;
  if (SEGMENTED_KEYS.has(key)) return SegmentedControl;
  return choices.length > RADIO_LIMIT ? SelectControl : RadioControl;
}

/**
 * The one control of a setting, named by its label and described by its help text and its default line; nothing for
 * a value no plain control can set.
 * `deviceName` is this device's name: a value set on any other device names where it was set.
 * `persisted` false says the device cannot keep the value beyond this session.
 */
export function SettingRow(props: {
  settingKey: SettingKey;
  deviceName: string | null;
  persisted: boolean;
  /** Optional roomier card-row padding when rendered inside a divided SettingsCard. */
  cardRow?: boolean;
}): ReactNode {
  const { settingKey, deviceName, persisted, cardRow = false } = props;
  const store = useSettingsStore();
  const value = useSetting(settingKey);
  // read in each render that the value causes: who set it and the default line change with it
  const explained = store.explain(settingKey);
  const def = SETTINGS.get(settingKey);
  const id = useId();
  const ids = { label: `${id}-label`, help: `${id}-help`, line: `${id}-line` };
  const describedBy =
    def.description === null ? ids.line : `${ids.help} ${ids.line}`;
  const Control = controlFor(settingKey);
  if (Control === null) return null;
  // radio groups and segmented controls stack under their label so narrow viewports and 200% zoom never overflow
  const stacked = Control === RadioControl || Control === SegmentedControl;
  return (
    <div
      data-tour={`setting:${settingKey}`}
      className={cn(
        "relative flex gap-x-4 gap-y-2",
        cardRow ? "px-4 py-3" : "py-1",
        stacked ? "flex-col" : "flex-wrap items-center justify-between",
        def.description === null && !explained.modified
          ? "min-h-row"
          : "min-h-row-2",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5">
          <span id={ids.label} className="text-ui font-medium text-fg">
            {def.label}
          </span>
          {explained.modified ? (
            <span
              aria-hidden="true"
              className="mn-setting-dot size-1.5 shrink-0 rounded-full bg-primary"
            />
          ) : null}
        </span>
        {def.description === null ? null : (
          <p id={ids.help} className="max-w-prose text-meta text-fg-muted">
            {def.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p
            id={ids.line}
            className={
              explained.modified ? "text-meta text-fg-muted" : "sr-only"
            }
          >
            {defaultLine(settingKey, explained, deviceName)}
          </p>
          {explained.modified ? (
            <Button
              variant="link"
              className="h-auto p-0 text-meta"
              disabled={!explained.writable}
              onClick={() => store.reset(settingKey)}
            >
              {PREFERENCES_WORDS.reset}
            </Button>
          ) : null}
        </div>
        {persisted ? null : (
          <p className="text-meta text-attention">
            {PREFERENCES_WORDS.notSavedHere}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <Control
          settingKey={settingKey}
          value={value}
          labelId={ids.label}
          describedBy={describedBy}
          disabled={!explained.writable}
        />
      </div>
    </div>
  );
}
