// The sign-out guard dialog: asks before signing out when changes are waiting, and offers sequential Export a copy.
import {
  ACCOUNT_WORDS,
  Button,
  ConsequenceDialog,
  TimingProvider,
  useSubscribable,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useServices } from "../services/context.tsx";
import {
  closeSignOutPrompt,
  registerSignOutHost,
  signOutPrompt,
} from "./sign-out-store.ts";
import type { SignOutPrompt } from "./sign-out-store.ts";

type ExportStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "exporting"; readonly count: number }
  | { readonly kind: "done"; readonly text: string }
  | { readonly kind: "refused"; readonly text: string };

const IDLE: ExportStatus = Object.freeze({ kind: "idle" });

function SignOutGuardDialog(props: { active: SignOutPrompt }): ReactNode {
  const { active } = props;
  const [status, setStatus] = useState<ExportStatus>(IDLE);
  const { scripts } = active;

  useEffect(() => {
    setStatus(IDLE);
  }, [active]);

  const busy = status.kind === "exporting";

  const exportAll = async (): Promise<void> => {
    if (busy || scripts.length === 0) return;
    setStatus({ kind: "exporting", count: scripts.length });
    const { exportWaitingScripts } = await import("./export-waiting.ts");
    const outcome = await exportWaitingScripts(
      active.services,
      scripts,
      active.now,
    );
    if (outcome.ok) {
      setStatus({
        kind: "done",
        text: ACCOUNT_WORDS.exportedScripts(outcome.titles),
      });
    } else {
      setStatus({
        kind: "refused",
        text: ACCOUNT_WORDS.exportFailed(outcome.failedTitle),
      });
    }
  };

  return (
    <ConsequenceDialog
      open
      title={ACCOUNT_WORDS.signOutWaitingTitle(active.totalWaiting)}
      body={ACCOUNT_WORDS.signOutWaitingBody(active.totalWaiting)}
      action={ACCOUNT_WORDS.signOut}
      busyLabel={null}
      refusal={null}
      destructive={false}
      actionTour="workspace:sign_out"
      onAction={active.onConfirm}
      onCancel={active.onCancel}
    >
      {scripts.length === 0 ? null : (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="link"
            className="h-auto p-0"
            disabled={busy}
            onClick={() => void exportAll()}
          >
            {ACCOUNT_WORDS.exportCopy}
          </Button>
          {status.kind === "exporting" ? (
            <p role="status" className="text-ui text-fg-muted">
              {ACCOUNT_WORDS.exportingFiles(status.count)}
            </p>
          ) : null}
          {status.kind === "done" ? (
            <p role="status" className="text-ui text-fg-muted">
              {status.text}
            </p>
          ) : null}
          {status.kind === "refused" ? (
            <p role="alert" className="flex items-start gap-1 text-ui text-fg">
              <TriangleExclamationPointIcon
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-attention"
              />
              <span>{status.text}</span>
            </p>
          ) : null}
        </div>
      )}
    </ConsequenceDialog>
  );
}

/** Renders the sign-out guard dialog when active for the current person; mounted inside PersonMenu and AccountPane. */
export function SignOutDialogHost(): ReactNode {
  const services = useServices();
  const active = useSubscribable(signOutPrompt);
  useEffect(() => registerSignOutHost(), []);
  useEffect(() => {
    const current = signOutPrompt.get();
    if (current !== null && current.services !== services) closeSignOutPrompt();
  }, [services]);
  if (active === null || active.services !== services) return null;
  return <SignOutGuardDialog active={active} />;
}

let fallbackRoot: Root | null = null;
let fallbackContainer: HTMLElement | null = null;

function unmountFallbackHost(): void {
  fallbackRoot?.unmount();
  fallbackRoot = null;
  fallbackContainer?.remove();
  fallbackContainer = null;
}

function FallbackHost(props: { now: () => number }): ReactNode {
  const active = useSubscribable(signOutPrompt);
  const timing = useMemo(
    () => ({
      now: props.now,
      schedule: (fn: () => void, delayMs: number) => {
        const id = globalThis.setTimeout(fn, delayMs);
        return () => globalThis.clearTimeout(id);
      },
    }),
    [props.now],
  );
  useEffect(() => {
    if (active === null) queueMicrotask(unmountFallbackHost);
  }, [active]);
  if (active === null) return null;
  return (
    <TimingProvider timing={timing}>
      <SignOutGuardDialog active={active} />
    </TimingProvider>
  );
}

/** Mounts a temporary host when sign-out is invoked from a screen that renders neither PersonMenu nor AccountPane. */
export function ensureFallbackSignOutHost(now: () => number): void {
  if (typeof document === "undefined" || fallbackRoot !== null) return;
  const container = document.createElement("div");
  document.body.append(container);
  fallbackContainer = container;
  fallbackRoot = createRoot(container);
  fallbackRoot.render(<FallbackHost now={now} />);
}
