// Status bar readout for today's writing goal; hidden when no goal is set.
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  WRITING_TOOLS_WORDS,
  cn,
} from "@manent/ui";
import type { ReactNode } from "react";
import { openDetailsAt } from "../screens/document/details-tab.tsx";
import { useEnvironment } from "../services/context.tsx";
import { useScriptGoal } from "./use-goal.ts";

/** Shows `{done} of {target} pages/words` beside the page count when a goal is set; clicking opens Details → Script. */
export function GoalReadout(props: { docId: string }): ReactNode {
  const { frame } = useEnvironment();
  const { goal, done } = useScriptGoal(props.docId);
  if (goal === null) return null;
  const reached = done >= goal.target;
  const readout = WRITING_TOOLS_WORDS.goalReadout(done, goal.target, goal.kind);
  const tooltip = WRITING_TOOLS_WORDS.goalTooltip(done, goal.target, goal.kind);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-tour="status:goal"
            aria-label={tooltip}
            className={cn(
              "shrink-0 cursor-pointer text-meta tabular-nums",
              reached ? "font-medium text-ok" : "font-normal text-fg-muted",
            )}
            onClick={() => openDetailsAt("script", frame)}
          />
        }
      >
        {readout}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
