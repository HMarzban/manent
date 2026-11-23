// Reorganise: the demo's server reorganises how the open script is stored, as it does when a script outgrows its budget.
import { DEMO_WORDS } from "@manent/ui";
import { LayersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useServices } from "../services/context.tsx";
import { BarButton } from "./bar-button.tsx";

const TOUR = "demo:reorganise";

/** Unavailable without a script or a connection, and for a person who cannot edit the script. */
export function ReorganiseControl(props: {
  docId: string | null;
  offline: boolean;
}): ReactNode {
  const { docId, offline } = props;
  if (docId === null || offline)
    return (
      <BarButton
        label={DEMO_WORDS.reorganise}
        icon={LayersIcon}
        unavailable={
          docId === null ? DEMO_WORDS.needsScript : DEMO_WORDS.needsConnection
        }
        tour={TOUR}
      />
    );
  return <ScriptReorganise key={docId} docId={docId} />;
}

/**
 * The server reorganises the script at its next quiet moment, so the control stays busy from the press until the
 * script's handle says it is done, when the script's own message tells the person; a refused request ends it at once,
 * and so does leaving the script.
 */
function ScriptReorganise(props: { docId: string }): ReactNode {
  const { docId } = props;
  const { api, openHandle } = useServices();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    let stop: (() => void) | null = null;
    let current = true;
    const done = (): void => {
      if (current) setWaiting(false);
    };
    openHandle(docId).then(
      (handle) => {
        const unlisten = handle.on((event) => {
          if (event.type === "rebuilt") done();
        });
        stop = () => {
          unlisten();
          void handle.close();
        };
        if (!current) stop();
      },
      // a script this person's sync cannot open is never told it was reorganised
      done,
    );
    return () => {
      current = false;
      stop?.();
    };
  }, [waiting, docId, openHandle]);
  const canEdit = useCanEdit(docId);
  if (!canEdit)
    return (
      <BarButton
        label={DEMO_WORDS.reorganise}
        icon={LayersIcon}
        unavailable={DEMO_WORDS.needsEdit}
        tour={TOUR}
      />
    );
  return (
    <BarButton
      label={DEMO_WORDS.reorganise}
      icon={LayersIcon}
      tour={TOUR}
      hint={waiting ? DEMO_WORDS.reorganisingHint : DEMO_WORDS.reorganiseHint}
      busy={waiting ? DEMO_WORDS.reorganising : undefined}
      onClick={() => {
        setWaiting(true);
        api.rebuild(docId).catch(() => setWaiting(false));
      }}
    />
  );
}
