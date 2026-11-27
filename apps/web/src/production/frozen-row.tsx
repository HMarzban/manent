// A guarded row of Script settings once page numbers are locked: frozen since then, and changed only through
// Change layout… by people who can issue revisions.
import { formatMemoDate } from "@manent/revisions";
import { SETTINGS } from "@manent/settings";
import type { SettingKey } from "@manent/settings";
import {
  Button,
  CommandButton,
  Input,
  PRODUCTION_WORDS,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { valueLabel } from "../screens/document/setting-messages.ts";
import { useServices } from "../services/context.tsx";
import { useProductionContext } from "../state/production-context.store.ts";
import { Choices } from "./choices.tsx";
import { useProductionServices } from "./live-services.ts";
import { NOTHING_OPEN } from "./services.ts";
import type { ProductionServices } from "./services.ts";

const WORDS = PRODUCTION_WORDS;

/** A number for the row, which opens Change layout… once Enter or Apply is pressed on a valid changed value. */
function NumberEntry(props: {
  label: string;
  current: unknown;
  parse(typed: string): { ok: true; value: unknown } | { ok: false };
  onChoose(value: unknown): void;
  onCancel(): void;
}): ReactNode {
  const { current, parse, onChoose, onCancel } = props;
  const [typed, setTyped] = useState(String(current ?? ""));
  const [invalid, setInvalid] = useState(false);
  const alertId = useId();

  const submit = (): void => {
    const parsed = parse(typed);
    if (parsed.ok && !Object.is(parsed.value, current)) {
      setInvalid(false);
      onChoose(parsed.value);
      return;
    }
    setInvalid(true);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          className="w-20 tabular-nums"
          aria-label={props.label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? alertId : undefined}
          // the entry appears because Change layout… was pressed for it
          autoFocus
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            if (invalid) setInvalid(false);
          }}
          onKeyDown={onKeyDown}
        />
        <Button type="button" variant="outline" size="sm" onClick={submit}>
          {WORDS.applyLayoutValue}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {WORDS.cancelLayoutValue}
        </Button>
      </div>
      {invalid ? (
        <p id={alertId} role="alert" className="text-meta text-attention">
          {WORDS.invalidLayoutValue}
        </p>
      ) : null}
    </div>
  );
}

/** The row's other values, one of which opens Change layout… for it: a choice among them, or a number typed. */
function NewValue(props: {
  settingKey: SettingKey;
  services: ProductionServices;
  onCancel(): void;
}): ReactNode {
  const { settingKey, services, onCancel } = props;
  const def = SETTINGS.get(settingKey);
  const current = useServices().openScriptStore(services.docId).get(settingKey);
  const choose = (value: unknown): void =>
    services.open.set({
      kind: "change_layout",
      change: {
        key: settingKey,
        value,
        noun: def.noun ?? def.label,
        valueLabel: valueLabel(settingKey, value, "row"),
      },
    });
  if (def.type.kind === "number")
    return (
      <NumberEntry
        label={def.label}
        current={current}
        parse={(typed) =>
          def.type.parse(typed.trim() === "" ? null : Number(typed))
        }
        onChoose={choose}
        onCancel={onCancel}
      />
    );
  const choices = (def.type.choices ?? []).filter(
    (choice) => choice.value !== current,
  );
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };
  return (
    <Choices
      label={def.label}
      value={null}
      choices={choices}
      autoFocusFirst
      onKeyDown={onKeyDown}
      onChoose={choose}
    />
  );
}

const ENGINE_VERSION_KEY = "script.engineVersion";

// a value only its own row can set has no plain way to a new one here; the layout engine is never changed through Change layout…
const isChangedHere = (settingKey: SettingKey): boolean => {
  if (String(settingKey) === ENGINE_VERSION_KEY) return false;
  const { kind } = SETTINGS.get(settingKey).type;
  return kind === "boolean" || kind === "choice" || kind === "number";
};

function Frozen(props: {
  settingKey: SettingKey;
  services: ProductionServices;
}): ReactNode {
  const { settingKey, services } = props;
  const held = useSubscribable(services.client.current());
  const { canIssue } = useSubscribable(services.access);
  const open = useSubscribable(services.open);
  const change = useCommandState("production.changeLayout");
  const lockedOn = held?.state.lockedOn ?? null;
  const triggerWrapRef = useRef<HTMLSpanElement>(null);
  const isChoosing = open.kind === "choose_layout" && open.key === settingKey;
  const closeAndRestore = (): void => {
    services.open.set(NOTHING_OPEN);
    requestAnimationFrame(() => {
      triggerWrapRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
    });
  };
  const offer = canIssue ? (
    // the press names the row Change layout… is for, before the command runs
    <span
      ref={triggerWrapRef}
      onClickCapture={(event) => {
        if (!change.enabled) return;
        if (isChoosing) {
          event.stopPropagation();
          services.open.set(NOTHING_OPEN);
          return;
        }
        services.open.set({ kind: "choose_layout", key: settingKey });
      }}
    >
      <CommandButton
        id="production.changeLayout"
        variant="outline"
        size="sm"
        aria-expanded={isChoosing}
      />
    </span>
  ) : (
    <span>{WORDS.askToChangeLayout}</span>
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
        {lockedOn === null ? null : (
          <span>{WORDS.frozenRow(formatMemoDate(lockedOn))}</span>
        )}
        {isChangedHere(settingKey) ? offer : null}
      </p>
      {isChoosing ? (
        <NewValue
          settingKey={settingKey}
          services={services}
          onCancel={closeAndRestore}
        />
      ) : null}
    </div>
  );
}

/** Nothing for a row that is not guarded, or while page numbers are not locked. */
export function FrozenRow(props: {
  settingKey: SettingKey;
  docId: string;
}): ReactNode {
  const { settingKey, docId } = props;
  const services = useProductionServices(docId);
  const locked = useProductionContext(docId)?.locked === true;
  if (services === null || !locked) return null;
  if (SETTINGS.get(settingKey).guard !== "layout") return null;
  return <Frozen settingKey={settingKey} services={services} />;
}
