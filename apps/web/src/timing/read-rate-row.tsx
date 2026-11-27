// Project settings → Format and style → Read rate row: number field, unit, Reset, and refused-entry line.
import { DEFAULT_READ_RATE } from "@manent/pagination";
import { SETTINGS } from "@manent/settings";
import type { SettingKey } from "@manent/settings";
import {
  Button,
  Input,
  PREFERENCES_WORDS,
  TIMING_WORDS,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

const formatRate = (rate: number): string => String(Number(rate.toFixed(2)));

function parseEnteredRate(typed: string): number | null {
  if (!DECIMAL.test(typed)) return null;
  const parsed = SETTINGS.get("project.readRate").type.parse(Number(typed));
  return parsed.ok && typeof parsed.value === "number" ? parsed.value : null;
}

function ReadRateLabel(props: {
  labelId: string;
  helpId: string;
  lineId: string;
  label: string;
  description: string | null;
  defaultRate: number;
  modified: boolean;
  writable: boolean;
  onReset(): void;
}): ReactNode {
  const {
    labelId,
    helpId,
    lineId,
    label,
    description,
    defaultRate,
    modified,
    writable,
    onReset,
  } = props;
  return (
    <div className="flex min-w-0 flex-col">
      <span id={labelId} className="text-ui font-medium">
        {label}
      </span>
      {description === null ? null : (
        <p id={helpId} className="text-meta text-fg-muted">
          {description}
        </p>
      )}
      {modified ? (
        <div className="flex items-center gap-2">
          <p id={lineId} className="text-meta text-fg-muted">
            {PREFERENCES_WORDS.defaultIs(
              TIMING_WORDS.readRateValue(defaultRate),
            )}
          </p>
          {writable ? (
            <Button
              variant="link"
              className="h-auto p-0 text-meta"
              onClick={onReset}
            >
              {PREFERENCES_WORDS.reset}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Number field for `project.readRate` with its unit after the field and the refused-entry sentence beneath. */
export function ReadRateRow(props: {
  readonly settingKey: SettingKey;
  readonly projectId: string;
}): ReactNode {
  const { settingKey } = props;
  const store = useSettingsStore();
  const value = useSetting("project.readRate");
  const explained = store.explain("project.readRate");
  const def = SETTINGS.get("project.readRate");
  const id = useId();
  const ids = {
    label: `${id}-label`,
    help: `${id}-help`,
    line: `${id}-line`,
    error: `${id}-error`,
  };
  // null while the field shows the stored rate; ref prevents blur after Enter from committing twice
  const [typed, setTyped] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const setDraft = (next: string | null): void => {
    pending.current = next;
    setTyped(next);
  };
  const commit = (): void => {
    const raw = pending.current;
    if (raw === null) return;
    setDraft(null);
    const trimmed = raw.trim();
    if (trimmed === "") {
      setRefused(null);
      return;
    }
    const parsed = parseEnteredRate(trimmed);
    if (parsed === null) {
      setRefused(trimmed);
      return;
    }
    setRefused(null);
    if (!Object.is(parsed, value)) store.set("project.readRate", parsed);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") commit();
    else if (event.key === "Escape") {
      event.stopPropagation();
      setDraft(null);
      setRefused(null);
    }
  };
  const describedBy = [
    ...(def.description === null ? [] : [ids.help]),
    ...(explained.modified ? [ids.line] : []),
    ...(refused === null ? [] : [ids.error]),
  ].join(" ");
  const defaultRate =
    typeof def.default === "number" ? def.default : DEFAULT_READ_RATE;
  return (
    <div
      data-tour={`setting:${settingKey}`}
      className="flex min-h-row-2 flex-col gap-2 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ReadRateLabel
          labelId={ids.label}
          helpId={ids.help}
          lineId={ids.line}
          label={def.label}
          description={def.description}
          defaultRate={defaultRate}
          modified={explained.modified}
          writable={explained.writable}
          onReset={() => {
            setDraft(null);
            setRefused(null);
            store.reset("project.readRate");
          }}
        />
        <div className="flex shrink-0 items-center gap-2">
          <Input
            type="text"
            inputMode="decimal"
            className="w-20 tabular-nums"
            value={typed ?? formatRate(value)}
            onChange={(event) => {
              setDraft(event.target.value);
              if (refused !== null) setRefused(null);
            }}
            onBlur={commit}
            onKeyDown={onKeyDown}
            aria-labelledby={ids.label}
            aria-describedby={describedBy === "" ? undefined : describedBy}
            aria-invalid={refused !== null ? "true" : undefined}
            disabled={!explained.writable}
          />
          <span className="text-ui text-fg-muted">
            {TIMING_WORDS.readRateUnit}
          </span>
        </div>
      </div>
      {refused === null ? null : (
        <p
          id={ids.error}
          role="alert"
          className="flex items-start gap-2 text-meta text-fg"
        >
          <TriangleExclamationPointIcon
            aria-hidden="true"
            className="mt-0.5 size-icon shrink-0 text-attention"
          />
          <span>{TIMING_WORDS.readRateRefused(refused)}</span>
        </p>
      )}
    </div>
  );
}
