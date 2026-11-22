// The demo bar's Connection: this tab's sync online, cut off or slowed, kept for the tab.
import { DEMO_WORDS, Segmented, useSubscribable } from "@manent/ui";
import { useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { connectionAtNode } from "../desktop/desktop-sync.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { asUiSubscribable } from "../services/sync/subscribable.ts";
import {
  CONNECTION_MODES,
  isConnectionMode,
} from "../services/sync/device-memory.ts";
import { FactsContext } from "../state/bridge-contexts.ts";
import type { ConnectionControl } from "./connection-transport.ts";
import { BarLabelled } from "./demo-bar-control.tsx";

const OPTIONS = CONNECTION_MODES.map((mode) => ({
  value: mode,
  label: DEMO_WORDS[mode],
}));

/** Drawn only inside the shell, once the person's sync has started. */
export function Connection(): ReactNode {
  // the shell provides the services together with the bridge's contexts
  const inShell = useContext(FactsContext) !== null;
  return inShell ? <PersonConnection /> : null;
}

function PersonConnection(): ReactNode {
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
  return control === null ? null : <ConnectionChoice control={control} />;
}

function ConnectionChoice(props: { control: ConnectionControl }): ReactNode {
  const { control } = props;
  const mode = useSubscribable(asUiSubscribable(control.mode));
  return (
    <BarLabelled label={DEMO_WORDS.connection}>
      <Segmented
        label={DEMO_WORDS.connection}
        size="sm"
        value={mode}
        options={OPTIONS}
        onChange={(chosen) => {
          if (isConnectionMode(chosen)) control.set(chosen);
        }}
      />
    </BarLabelled>
  );
}
