// The demo bar's Connection: this tab's sync online, cut off or slowed, kept for the tab.
import {
  DEMO_WORDS,
  RadioGroup,
  RadioGroupItem,
  useSubscribable,
} from "@manent/ui";
import { useContext, useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useServices } from "../services/context.tsx";
import { asUiSubscribable } from "../services/sync/subscribable.ts";
import {
  CONNECTION_MODES,
  isConnectionMode,
} from "../services/sync/device-memory.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import type { ConnectionControl } from "./connection-transport.ts";

/** Drawn only inside the shell, once the person's sync has started. */
export function Connection(): ReactNode {
  // the shell provides the services together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  return inShell ? <PersonConnection /> : null;
}

function PersonConnection(): ReactNode {
  const { connection } = useServices();
  const [control, setControl] = useState<ConnectionControl | null>(null);
  useEffect(() => {
    let current = true;
    connection.then(
      (started) => {
        if (current) setControl(started);
      },
      () => {
        // a sync that cannot start has no connection to cut or slow
      },
    );
    return () => {
      current = false;
    };
  }, [connection]);
  return control === null ? null : <ConnectionChoice control={control} />;
}

function ConnectionChoice(props: { control: ConnectionControl }): ReactNode {
  const { control } = props;
  const mode = useSubscribable(asUiSubscribable(control.mode));
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <span id={`${id}-label`}>{DEMO_WORDS.connection}</span>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={mode}
        onValueChange={(chosen) => {
          if (isConnectionMode(chosen)) control.set(chosen);
        }}
        className="flex w-auto items-center gap-2"
      >
        {CONNECTION_MODES.map((choice) => (
          <span key={choice} className="flex items-center gap-1">
            <RadioGroupItem
              value={choice}
              aria-labelledby={`${id}-${choice}`}
            />
            <span id={`${id}-${choice}`}>{DEMO_WORDS[choice]}</span>
          </span>
        ))}
      </RadioGroup>
    </div>
  );
}
