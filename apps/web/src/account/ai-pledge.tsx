// The AI pledge statement and its in-place disclosure, drawn on Choose who you are.
import { Button, PREFERENCES_WORDS } from "@manent/ui";
import { ChevronDownIcon, ShieldCheckIcon } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";

export function AiPledge(): ReactNode {
  const [open, setOpen] = useState(false);
  const pledgeId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 text-meta text-fg-muted">
          <ShieldCheckIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-fg-muted"
          />
          <span>{PREFERENCES_WORDS.aiPledge}</span>
        </p>
        <Button
          variant="link"
          className="h-auto shrink-0 gap-1 p-0 text-meta"
          aria-expanded={open}
          aria-controls={pledgeId}
          onClick={() => setOpen((shown) => !shown)}
        >
          <span>{PREFERENCES_WORDS.readAiPledge}</span>
          <ChevronDownIcon
            aria-hidden="true"
            data-open={open ? "" : undefined}
            className="mn-choose-chevron size-icon shrink-0"
          />
        </Button>
      </div>
      <div id={pledgeId}>
        {open ? (
          <p className="text-meta text-fg-muted animate-in fade-in-0 slide-in-from-top-1 duration-(--dur-fast) ease-out">
            {PREFERENCES_WORDS.aiPledgeFull}
          </p>
        ) : null}
      </div>
    </div>
  );
}
