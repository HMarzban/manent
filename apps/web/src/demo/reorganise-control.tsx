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
  return <ScriptReorganise docId={docId} />;
}

function ScriptReorganise(props: { docId: string }): ReactNode {
  const { api } = useServices();
  if (!useCanEdit(props.docId)) return null;
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
