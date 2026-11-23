// Reorganise: the demo's server reorganises how the open script is stored, at once, as it does when a script outgrows its budget.
import { DEMO_WORDS } from "@manent/ui";
import { LayersIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useServices } from "../services/context.tsx";
import { BarButton } from "./bar-button.tsx";

const TOUR = "demo:reorganise";

/** Disabled without a script or a connection; absent for a person who cannot edit the script. */
export function ReorganiseControl(props: {
  docId: string | null;
  offline: boolean;
}): ReactNode {
  const { docId, offline } = props;
  if (docId === null) return <Unavailable reason={DEMO_WORDS.needsScript} />;
  return <ScriptReorganise docId={docId} offline={offline} />;
}

function Unavailable(props: { reason: string }): ReactNode {
  return (
    <BarButton
      label={DEMO_WORDS.reorganise}
      icon={LayersIcon}
      unavailable={props.reason}
      tour={TOUR}
    />
  );
}

function ScriptReorganise(props: {
  docId: string;
  offline: boolean;
}): ReactNode {
  const { api } = useServices();
  if (!useCanEdit(props.docId)) return null;
  if (props.offline) return <Unavailable reason={DEMO_WORDS.needsConnection} />;
  return (
    <BarButton
      label={DEMO_WORDS.reorganise}
      icon={LayersIcon}
      tour={TOUR}
      onClick={() => {
        api.rebuild(props.docId).catch(() => {
          // nothing changes in the text either way; the message the product shows afterwards is the one sign it ran
        });
      }}
    />
  );
}
