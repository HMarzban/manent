// Reset: the demo seeded again for everyone, after the consequence dialog.
import { ConsequenceDialog, DEMO_WORDS } from "@manent/ui";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { ControlState } from "../api.ts";
import { useEnvironment } from "../services/context.tsx";
import { tourActions } from "../state/tour.store.ts";
import { BarButton } from "./bar-button.tsx";
import { clearDemoTourStorage } from "./tour-progress.ts";
import { SERVER_STATUS_QUERY } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";

/**
 * Keeps the consequence dialog open with a busy label while the supervisor accepts the reset, clears Tour storage
 * only once accepted, and surfaces supervisor refusal cleanly instead of discarding state prematurely.
 */
export function ResetControl(props: DemoControl): ReactNode {
  const { client } = props;
  const { storage, tabStorage } = useEnvironment();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const reset = async (): Promise<void> => {
    setBusy(true);
    setRefusal(null);
    const queryKey = [SERVER_STATUS_QUERY, props.id];
    try {
      const answered = await client.reset();
      await queryClient.cancelQueries({ queryKey });
      tourActions.close();
      tourActions.select(null);
      clearDemoTourStorage(storage, tabStorage);
      queryClient.setQueryData<ControlState>(queryKey, answered);
      setBusy(false);
      setOpen(false);
    } catch {
      setBusy(false);
      setRefusal(DEMO_WORDS.resetRefused);
    }
  };

  return (
    <>
      <BarButton
        label={DEMO_WORDS.reset}
        icon={RotateCcwIcon}
        tour="demo:reset"
        hint={DEMO_WORDS.resetHint}
        onClick={() => {
          setRefusal(null);
          setOpen(true);
        }}
      />
      <ConsequenceDialog
        open={open}
        title={DEMO_WORDS.resetTitle}
        body={DEMO_WORDS.resetBody}
        action={DEMO_WORDS.resetAction}
        busyLabel={busy ? DEMO_WORDS.resettingAction : null}
        refusal={refusal}
        destructive
        onAction={() => void reset()}
        onCancel={() => {
          if (!busy) {
            setRefusal(null);
            setOpen(false);
          }
        }}
      />
    </>
  );
}
