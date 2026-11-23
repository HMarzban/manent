// Reorganise: the demo's server reorganises how the open script is stored, as it does when a script outgrows its budget.
import { DEMO_WORDS } from "@manent/ui";
import { LayersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useServices } from "../services/context.tsx";
import { BarButton } from "./bar-button.tsx";

const TOUR = "demo:reorganise";

/**
 * Unavailable without a script or a connection, for a person who has not signed in (the server holds none of their
 * scripts), and for a person who cannot edit the script.
 */
export function ReorganiseControl(props: {
  docId: string | null;
  signedIn: boolean;
  offline: boolean;
}): ReactNode {
  const { docId, signedIn, offline } = props;
  if (docId === null) return <Unavailable reason={DEMO_WORDS.needsScript} />;
  if (!signedIn) return <Unavailable reason={DEMO_WORDS.needsSyncedScript} />;
  return <ScriptReorganise key={docId} docId={docId} offline={offline} />;
}

function Unavailable(props: { reason: string }): ReactNode {
  return (
    <BarButton
      label={DEMO_WORDS.reorganise}
      icon={LayersIcon}
      drops="first"
      unavailable={props.reason}
      tour={TOUR}
    />
  );
}

/**
 * The server reorganises the script at its next quiet moment, so the control stays busy from the press until the
 * script's handle says it is done, when the script's own message tells the person; a refused request ends it at once,
 * and so does leaving the script.
 */
function ScriptReorganise(props: {
  docId: string;
  offline: boolean;
}): ReactNode {
  const { docId, offline } = props;
  const { api, openHandle } = useServices();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    let unlisten: (() => void) | null = null;
    let current = true;
    const done = (): void => {
      if (current) setWaiting(false);
    };
    // the handle is the one the open script holds, shared in this tab: only the listener is removed, never the handle closed
    openHandle(docId).then(
      (handle) => {
        if (!current) return;
        unlisten = handle.on((event) => {
          if (event.type === "rebuilt") done();
        });
      },
      // a script this person's sync cannot open is never told it was reorganised
      done,
    );
    return () => {
      current = false;
      unlisten?.();
    };
  }, [waiting, docId, openHandle]);
  // checked before the connection, so that the reason does not change when the connection does
  if (!useCanEdit(docId)) return <Unavailable reason={DEMO_WORDS.needsEdit} />;
  if (offline) return <Unavailable reason={DEMO_WORDS.needsConnection} />;
  return (
    <BarButton
      label={DEMO_WORDS.reorganise}
      icon={LayersIcon}
      drops="first"
      tour={TOUR}
      hint={
        waiting ? DEMO_WORDS.reorganiseWaitingHint : DEMO_WORDS.reorganiseHint
      }
      busy={waiting ? DEMO_WORDS.reorganiseWaiting : undefined}
      onClick={() => {
        setWaiting(true);
        api.rebuild(docId).catch(() => setWaiting(false));
      }}
    />
  );
}
