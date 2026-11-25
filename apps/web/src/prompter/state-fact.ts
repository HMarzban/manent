// State bar fact source for `prompter_send` and per-rundown prompter runtime binding on open rundowns.
import type { SettingValue } from "@manent/settings";
import { useSubscribable } from "@manent/ui";
import type { StateFact } from "@manent/ui";
import { useSyncExternalStore } from "react";
import { useBeside } from "../beside/open-beside.ts";
import { useRundownView } from "../rundown/rundown-view-store.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { usePrompterRuntime } from "./prompter-session.ts";

const NO_FACTS: readonly StateFact[] = Object.freeze([]);
const PROMPTER_SEND_FACTS: readonly StateFact[] = Object.freeze([
  { kind: "prompter_send" },
]);

const subscribeNothing = (): (() => void) => () => {};
const readNoFormat = (): SettingValue<"script.format"> | null => null;

function useStoryFormat(
  storyDocId: string | null,
): SettingValue<"script.format"> | null {
  const services = useServices();
  return useSyncExternalStore(
    (onStoreChange) => {
      if (storyDocId === null) return subscribeNothing();
      const store = services.openScriptStore(storyDocId);
      return store.subscribe("script.format", onStoreChange);
    },
    () =>
      storyDocId === null
        ? readNoFormat()
        : services.openScriptStore(storyDocId).get("script.format"),
  );
}

/**
 * Retains the prompter runtime while a rundown is open in `DocumentStateBar`, and emits `{ kind: "prompter_send" }`
 * for a Variety story open Beside its rundown when the signed-in person holds `send_to_prompter`.
 */
export function usePrompterSendFacts(docId: string): readonly StateFact[] {
  const { shellState } = useEnvironment();
  const mainDocId = useSubscribable(shellState).docId;
  const beside = useBeside();
  const isStoryBeside =
    beside !== null && beside.kind === "story" && beside.docId === docId;
  const ownView = useRundownView(docId);
  const rundownId = isStoryBeside ? mainDocId : ownView !== null ? docId : null;
  const runtime = usePrompterRuntime(
    rundownId,
    ownView !== null && !isStoryBeside ? { view: ownView, beside } : undefined,
  );
  const format = useStoryFormat(isStoryBeside ? docId : null);

  if (!isStoryBeside) return NO_FACTS;
  if (!runtime.canSend || format !== "variety") return NO_FACTS;
  return PROMPTER_SEND_FACTS;
}
