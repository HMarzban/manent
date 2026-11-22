// The close guard's question, drawn while it is asked; loaded apart from the entry, whose size budget its dialog would break.
import { ConsequenceDialog, useSubscribable } from "@manent/ui";
import type { ReactNode } from "react";
import { useServices } from "../context.tsx";

export function CloseQuestion(): ReactNode {
  const question = useSubscribable(useServices().closing.question);
  return question === null ? null : <ConsequenceDialog {...question} />;
}
