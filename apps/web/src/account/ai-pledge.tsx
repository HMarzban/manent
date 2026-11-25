// The AI pledge statement and its in-place disclosure, drawn on Choose who you are.
import { Button, PREFERENCES_WORDS } from "@manent/ui";
import { useId, useState } from "react";
import type { ReactNode } from "react";

export function AiPledge(): ReactNode {
  const [open, setOpen] = useState(false);
  const pledgeId = useId();
  return (
    <div className="flex flex-col gap-1">
      <p className="text-ui text-fg-muted">{PREFERENCES_WORDS.aiPledge}</p>
      <div>
        <Button
          variant="link"
          className="h-auto p-0"
          aria-expanded={open}
          aria-controls={pledgeId}
          onClick={() => setOpen((shown) => !shown)}
        >
          {PREFERENCES_WORDS.readAiPledge}
        </Button>
      </div>
      <div id={pledgeId}>
        {open ? (
          <p className="mt-1 text-ui text-fg-muted">
            {PREFERENCES_WORDS.aiPledgeFull}
          </p>
        ) : null}
      </div>
    </div>
  );
}
