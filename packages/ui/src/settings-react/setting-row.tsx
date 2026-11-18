// One setting's row, generated from its definition: the control, its help, its default and who set it.
import { SETTINGS } from "@manent/settings";
import type {
  Choice,
  Explained,
  SettingKey,
  SettingValue,
  SettingsStore,
} from "@manent/settings";
import { useId, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Segmented } from "../components/segmented/segmented.tsx";
import { Button } from "../components/stock/button.tsx";
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
import { READOUT_WORDS } from "../words/document.ts";
import { formatDate } from "../words/format.ts";
import { PREFERENCES_WORDS } from "../words/preferences.ts";
import { useSettingsStore } from "./settings-context.tsx";
import { useSetting } from "./use-setting.ts";

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

function choiceLabel(
  choices: readonly Choice<string>[],
  value: unknown,
): string {
  return choices.find((choice) => choice.value === value)?.label ?? "";
}

function valueLabel(key: SettingKey, value: unknown): string {
  const { choices } = SETTINGS.get(key).type;
  if (choices !== null) return choiceLabel(choices, value);
  return value === true ? READOUT_WORDS.valueOn : READOUT_WORDS.valueOff;
}

/** Writes what a control reports, once the setting's own type accepts it. */
function setFrom(store: SettingsStore, key: SettingKey, input: unknown): void {
  const parsed = SETTINGS.get(key).type.parse(input);
  if (parsed.ok) store.set(key, parsed.value);
}

/** The line under the control: when you set it, with its default; or the default alone. */
function defaultLine(
  key: SettingKey,
  explained: Explained<SettingValue<SettingKey>>,
  deviceName: string | null,
): string {
  const defaultLabel = valueLabel(key, SETTINGS.get(key).default);
  const { modified, provenance } = explained;
  // a value set by someone else is never said to be yours, and the row has no way to name them
  if (
    !modified ||
    provenance === null ||
    provenance.at === null ||
    provenance.byUserId !== null
  )
    return PREFERENCES_WORDS.defaultIs(defaultLabel);
  const { on } = provenance;
  const from = on === null || on === deviceName ? null : on;
  return PREFERENCES_WORDS.setByYou(
    formatDate(provenance.at),
    defaultLabel,
    from,
  );
}

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
        <span key={choice.value} className="flex items-center gap-2 text-ui">
          <RadioGroupItem
            value={choice.value}
            aria-labelledby={`${id}-${choice.value}`}
          />
          <span id={`${id}-${choice.value}`}>{textOf(choice)}</span>
        </span>
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

function SegmentedControl({ settingKey, value }: ControlProps): ReactNode {
  const store = useSettingsStore();
  const def = SETTINGS.get(settingKey);
  return (
    <Segmented
      label={def.label}
      value={String(value)}
      options={def.type.choices ?? []}
      onChange={(chosen) => setFrom(store, settingKey, chosen)}
    />
  );
}

function controlFor(key: SettingKey): (props: ControlProps) => ReactNode {
  const { choices } = SETTINGS.get(key).type;
  if (choices === null) return SwitchControl;
  if (SEGMENTED_KEYS.has(key)) return SegmentedControl;
  return choices.length > RADIO_LIMIT ? SelectControl : RadioControl;
}

/**
 * The one control of a setting, named by its label and described by its help text and its default line.
 * `deviceName` is this device's name: a value set on any other device names where it was set.
 * `persisted` false says the device cannot keep the value beyond this session.
 */
export function SettingRow(props: {
  settingKey: SettingKey;
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const { settingKey, deviceName, persisted } = props;
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
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-4">
        <span id={ids.label} className="text-ui">
          {def.label}
        </span>
        <Control
          settingKey={settingKey}
          value={value}
          labelId={ids.label}
          describedBy={describedBy}
          disabled={!explained.writable}
        />
      </div>
      {def.description === null ? null : (
        <p id={ids.help} className="text-meta text-fg-muted">
          {def.description}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <p
          id={ids.line}
          className={explained.modified ? "text-meta text-fg-muted" : "sr-only"}
        >
          {defaultLine(settingKey, explained, deviceName)}
        </p>
        {explained.modified ? (
          <Button
            variant="ghost"
            size="sm"
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
  );
}
