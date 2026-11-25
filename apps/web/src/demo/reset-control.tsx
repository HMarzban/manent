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
 * While the supervisor stops the server, seeds again and starts it, the server reads resetting, in this tab from the
 * press on, and the page reloads once the new seed is served (useResetting). A seed that fails leaves it failed.
 */
export function ResetControl(props: DemoControl): ReactNode {
  const { client } = props;
  const { storage, tabStorage } = useEnvironment();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const reset = async (): Promise<void> => {
    setOpen(false);
    tourActions.close();
    tourActions.select(null);
    clearDemoTourStorage(storage, tabStorage);
    const queryKey = [SERVER_STATUS_QUERY, props.id];
    const answered = client.reset();
    // an answer to a question asked before the press would say it is still running
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<ControlState>(queryKey, "resetting");
    queryClient.setQueryData<ControlState>(queryKey, await answered);
  };
  return (
    <>
      <BarButton
        label={DEMO_WORDS.reset}
        icon={RotateCcwIcon}
        drops="first"
        tour="demo:reset"
        hint={DEMO_WORDS.resetHint}
        onClick={() => setOpen(true)}
      />
      <ConsequenceDialog
        open={open}
        title={DEMO_WORDS.resetTitle}
        body={DEMO_WORDS.resetBody}
        action={DEMO_WORDS.resetAction}
        busyLabel={null}
        refusal={null}
        destructive
        onAction={() => void reset()}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
