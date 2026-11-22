// What an empty or failed surface says in place of its content: one sentence and its way forward, start-aligned.
import { cn } from "cn";
import type { ReactNode } from "react";
import { Button } from "../stock/button.tsx";

interface SurfaceNoteProps {
  /** An empty surface's sentence is muted; a problem's is full strength. */
  kind: "empty" | "problem";
  /** A panel's note sits 16 px in; a screen's starts 48 px down its content column. */
  place: "panel" | "screen";
  sentence: string;
  /** Each a command's label and what it runs, drawn as bordered buttons under the sentence. */
  actions: readonly { label: string; onAction(): void }[];
}

/** Never centred, never red, never an illustration. */
export function SurfaceNote({
  kind,
  place,
  sentence,
  actions,
}: SurfaceNoteProps): ReactNode {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 text-ui",
        place === "panel" ? "p-4" : "pt-12",
      )}
    >
      <p className={kind === "empty" ? "text-fg-muted" : "text-fg"}>
        {sentence}
      </p>
      {actions.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size={place === "panel" ? "sm" : "default"}
              onClick={action.onAction}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
