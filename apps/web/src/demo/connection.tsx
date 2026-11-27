// The demo bar's Connection: this tab's sync online, cut off or slowed, kept for the tab.
import { DEMO_WORDS, Segmented, useSubscribable } from "@manent/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { connectionAtNode } from "../desktop/desktop-sync.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { asUiSubscribable } from "../services/sync/subscribable.ts";
import {
  CONNECTION_MODES,
  isConnectionMode,
} from "../services/sync/device-memory.ts";
import type { ConnectionControl } from "./connection-transport.ts";

const OPTIONS = CONNECTION_MODES.map((mode) => ({
  value: mode,
  label: DEMO_WORDS[mode],
}));

/** This tab's Connection once the person's sync has started; null until then, and when it cannot start. Inside the shell only. */
export function useConnectionControl(): ConnectionControl | null {
  const { connection } = useServices();
  const { desktop } = useEnvironment();
  const [control, setControl] = useState<ConnectionControl | null>(null);
  useEffect(() => {
    let current = true;
    connection.then(
      (started) => {
        // on desktop the node's link to the cloud is cut or slowed, never the window's to the node
        if (current)
          setControl(
            desktop === null ? started : connectionAtNode(started, desktop),
          );
      },
      () => {
        // a sync that cannot start has no connection to cut or slow
      },
    );
    return () => {
      current = false;
    };
  }, [connection, desktop]);
  return control;
}

export function ConnectionChoice(props: {
  control: ConnectionControl;
  /** Only the primary Connection control carries `data-tour="demo:connection"`. */
  tour?: boolean;
  fullWidth?: boolean;
}): ReactNode {
  const { control, tour = true, fullWidth = false } = props;
  const mode = useSubscribable(asUiSubscribable(control.mode));
  return (
    <div
      data-tour={tour ? "demo:connection" : undefined}
      className={
        fullWidth
          ? "mn-demo-segmented-full flex w-full"
          : "flex shrink-0 items-center"
      }
    >
      <Segmented
        label={DEMO_WORDS.connection}
        size="sm"
        value={mode}
        options={OPTIONS}
        onChange={(chosen) => {
          if (isConnectionMode(chosen)) control.set(chosen);
        }}
      />
    </div>
  );
}
