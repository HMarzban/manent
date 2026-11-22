// A guarded row of Script settings once page numbers are locked: frozen since then, and changed only through
// Change layout… by people who can issue revisions.
import { formatMemoDate } from "@manent/revisions";
import { SETTINGS } from "@manent/settings";
import type { SettingKey } from "@manent/settings";
import {
  CommandButton,
  PRODUCTION_WORDS,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import type { KeyboardEvent, ReactNode } from "react";
import { valueLabel } from "../screens/document/setting-messages.ts";
import { useServices } from "../services/context.tsx";
import { useProductionContext } from "../state/production-context.store.ts";
import { Choices } from "./choices.tsx";
import { useProductionServices } from "./live-services.ts";
import { NOTHING_OPEN } from "./services.ts";
import type { ProductionServices } from "./services.ts";

const WORDS = PRODUCTION_WORDS;

/** The row's other values, one of which opens Change layout… for it. */
function NewValue(props: {
  settingKey: SettingKey;
  services: ProductionServices;
}): ReactNode {
  const { settingKey, services } = props;
  const def = SETTINGS.get(settingKey);
  const current = useServices().openScriptStore(services.docId).get(settingKey);
  const choices = (def.type.choices ?? []).filter(
    (choice) => choice.value !== current,
  );
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") services.open.set(NOTHING_OPEN);
  };
  return (
    <Choices
      label={def.label}
      value={null}
      choices={choices}
      onKeyDown={onKeyDown}
      onChoose={(value) =>
        services.open.set({
          kind: "change_layout",
          change: {
            key: settingKey,
            value,
            noun: def.noun ?? def.label,
            valueLabel: valueLabel(settingKey, value, "row"),
          },
        })
      }
    />
  );
}

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
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
        {lockedOn === null ? null : (
          <span>{WORDS.frozenRow(formatMemoDate(lockedOn))}</span>
        )}
        {canIssue ? (
          // the press names the row Change layout… is for, before the command runs
          <span
            onClickCapture={() => {
              if (change.enabled)
                services.open.set({ kind: "choose_layout", key: settingKey });
            }}
          >
            <CommandButton
              id="production.changeLayout"
              variant="outline"
              size="sm"
            />
          </span>
        ) : (
          <span>{WORDS.askToChangeLayout}</span>
        )}
      </p>
      {open.kind === "choose_layout" && open.key === settingKey ? (
        <NewValue settingKey={settingKey} services={services} />
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
