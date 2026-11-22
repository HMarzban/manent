// Reset: the demo seeded again for everyone, after the consequence dialog.
import { ConsequenceDialog, DEMO_WORDS } from "@manent/ui";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { BarButton } from "./bar-button.tsx";
import { SERVER_STATUS_QUERY } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";

/**
 * While the supervisor stops the server, seeds again and starts it, the server line shows it stopped; once it is
 * running again the page reloads, and the new seed clears this browser's copies. A seed that fails leaves it stopped.
 */
export function ResetControl(props: DemoControl): ReactNode {
  const { client } = props;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const reset = (): void => {
    setOpen(false);
    const answered = client.reset();
    void queryClient.invalidateQueries({
      queryKey: [SERVER_STATUS_QUERY, props.id],
    });
    void answered.then((state) => {
      if (state === "running") window.location.reload();
    });
  };
  return (
    <>
      <BarButton
        label={DEMO_WORDS.reset}
        icon={RotateCcwIcon}
        tour="demo:reset"
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
        onAction={reset}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
