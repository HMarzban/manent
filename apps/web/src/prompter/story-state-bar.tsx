// State bar for a rundown row's story open Beside its rundown: air-window notice and Send to prompter action.
import { StateBar, stateBarLines } from "@manent/ui";
import type { ReactNode } from "react";
import { useRundownFacts } from "../rundown/state-facts.ts";
import { useCommandActions } from "../screens/document/status-bar.tsx";
import { usePrompterSendFacts } from "./state-fact.ts";

/**
 * Draws the Beside story's own state bar: the rundown's `air_window` notice while inside the air window, and
 * `Send to prompter` for Variety stories when the person holds `send_to_prompter`.
 */
export function StoryPrompterStateBar(props: {
  readonly rundownId: string | null;
  readonly storyDocId: string;
}): ReactNode {
  const { rundownId, storyDocId } = props;
  const rundownFacts = useRundownFacts(rundownId ?? "");
  const sendFacts = usePrompterSendFacts(storyDocId);
  const { run, registered } = useCommandActions();

  const inAirWindow = rundownFacts.some((fact) => fact.kind === "air_window");
  const hasSend = sendFacts.some((fact) => fact.kind === "prompter_send");
  if (!inAirWindow && !hasSend) return null;

  const airLine = inAirWindow
    ? stateBarLines([{ kind: "air_window" }]).left
    : null;
  const sendLine = hasSend
    ? stateBarLines([{ kind: "prompter_send" }]).left
    : null;

  const left = airLine ?? sendLine;
  const right = airLine !== null ? sendLine : null;

  return (
    <div className="shrink-0 border-t border-line">
      <StateBar left={left} right={right} run={run} registered={registered} />
    </div>
  );
}
