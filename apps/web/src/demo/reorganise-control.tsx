// Reorganise: the demo's server reorganises how the open script is stored, as it does when a script outgrows its budget.
import { DEMO_WORDS } from "@manent/ui";
import { LayersIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { useAnnouncer } from "../shell/announcer-region.tsx";
import { BarButton } from "./bar-button.tsx";

const TOUR = "demo:reorganise";
const REORGANISE_TIMEOUT_MS = 30_000;

/**
 * Shared hook attaching the `rebuilt` handle listener *before* calling `api.rebuild` so fast compaction never strands
 * the control in busy state, with a bounded timeout and explicit completion/refusal announcements.
 */
export function useScriptReorganise(docId: string | null): {
  waiting: boolean;
  trigger: () => void;
} {
  const { api, openHandle } = useServices();
  const { schedule } = useEnvironment();
  const announcer = useAnnouncer();
  const [waiting, setWaiting] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const clearPending = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setWaiting(false);
    clearPending();
    return () => {
      mountedRef.current = false;
      clearPending();
    };
  }, [docId, clearPending]);

  const trigger = useCallback(() => {
    if (docId === null || waiting) return;
    setWaiting(true);
    let active = true;
    let unlisten: (() => void) | null = null;
    let cancelTimer: (() => void) | null = null;

    const finish = (announced?: string): void => {
      if (!active) return;
      active = false;
      unlisten?.();
      cancelTimer?.();
      cleanupRef.current = null;
      if (mountedRef.current) setWaiting(false);
      if (announced !== undefined) announcer.announce(announced);
    };

    cleanupRef.current = () => {
      active = false;
      unlisten?.();
      cancelTimer?.();
    };

    cancelTimer = schedule(
      () => finish(DEMO_WORDS.reorganiseRefused),
      REORGANISE_TIMEOUT_MS,
    );

    void openHandle(docId).then(
      (handle) => {
        if (!active) return;
        unlisten = handle.on((event) => {
          if (event.type === "rebuilt") finish(DEMO_WORDS.reorganiseDone);
        });
        api.rebuild(docId).catch(() => finish(DEMO_WORDS.reorganiseRefused));
      },
      () => finish(DEMO_WORDS.reorganiseRefused),
    );
  }, [docId, waiting, openHandle, api, schedule, announcer]);

  return { waiting, trigger };
}

/**
 * Unavailable without a script, for a person who has not signed in (the server holds none of their scripts), for a
 * person who cannot edit the script, and while `unreachable` says why the server cannot be asked.
 */
export function ReorganiseControl(props: {
  docId: string | null;
  signedIn: boolean;
  unreachable: string | null;
}): ReactNode {
  const { docId, signedIn, unreachable } = props;
  if (docId === null) return <Unavailable reason={DEMO_WORDS.needsScript} />;
  if (!signedIn) return <Unavailable reason={DEMO_WORDS.needsSyncedScript} />;
  return (
    <ScriptReorganise key={docId} docId={docId} unreachable={unreachable} />
  );
}

function Unavailable(props: { reason: string }): ReactNode {
  return (
    <BarButton
      label={DEMO_WORDS.reorganise}
      icon={LayersIcon}
      unavailable={props.reason}
      tour={TOUR}
    />
  );
}

function ScriptReorganise(props: {
  docId: string;
  unreachable: string | null;
}): ReactNode {
  const { docId, unreachable } = props;
  const { waiting, trigger } = useScriptReorganise(docId);
  if (!useCanEdit(docId)) return <Unavailable reason={DEMO_WORDS.needsEdit} />;
  if (unreachable !== null) return <Unavailable reason={unreachable} />;
  return (
    <BarButton
      label={DEMO_WORDS.reorganise}
      icon={LayersIcon}
      tour={TOUR}
      hint={
        waiting ? DEMO_WORDS.reorganiseWaitingHint : DEMO_WORDS.reorganiseHint
      }
      busy={waiting ? DEMO_WORDS.reorganiseWaiting : undefined}
      onClick={trigger}
    />
  );
}
