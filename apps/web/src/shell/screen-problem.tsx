// What a screen's own area shows when the screen's code cannot load; the shell around it keeps working.
import { Button } from "@manent/ui";
import type { ReactNode } from "react";
import { TEXT } from "../text.ts";

/** The route error component of every screen whose code loads on its first visit. */
export function ScreenProblem(): ReactNode {
  return (
    <div className="flex flex-col items-start gap-2 p-6 text-ui">
      <p>{TEXT.screenProblem}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.location.reload()}
      >
        {TEXT.reload}
      </Button>
    </div>
  );
}
