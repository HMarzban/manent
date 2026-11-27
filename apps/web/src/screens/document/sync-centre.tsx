// The Sync centre: what is saved where, what waits by scene, what is to review and the receipts. It holds no state.
import {
  CommandButton,
  PopoverTitle,
  SYNC_CENTRE_WORDS,
  cn,
  statusText,
  useSubscribable,
} from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import {
  CloudCheckIcon,
  DownloadIcon,
  LogInIcon,
  MonitorDotIcon,
  SaveOffIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { CommandAction } from "./status-bar.tsx";
import { isStatusSettled } from "./status-writer.ts";

/** The line under a status the person may not understand; null for every other status. */
function explanation(facts: StatusFacts): string | null {
  // these statuses are shown only online, on a script that has synced, to a person who can edit or comment
  if (facts.neverSynced || facts.network === "offline") return null;
  if (facts.access === "view" || facts.access === "too_old") return null;
  switch (facts.server) {
    case "server_old":
      return SYNC_CENTRE_WORDS.serverOld;
    case "unreachable":
      return SYNC_CENTRE_WORDS.unreachable;
    case "app_old":
      return SYNC_CENTRE_WORDS.appOld;
    case "synced":
    case "syncing":
    case "sign_in":
    case "access_removed":
    case "deleted":
      return null;
  }
}

/** One part of the Sync centre, a hairline above every part but the first. */
function Part(props: { className?: string; children: ReactNode }): ReactNode {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-start gap-2 border-t border-line px-4 py-3 first:border-t-0",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

/** In the design's order: the heading and its explanation, the alert, signing in, to review, what waits, the receipts. */
export function SyncCentre(props: { doc: DocumentServices }): ReactNode {
  const { doc } = props;
  const { messages } = useServices();
  const facts = useSubscribable(doc.status);
  const waiting = useSubscribable(doc.waitingByScene);
  const receipts = useSyncExternalStore(messages.subscribe, messages.receipts);
  const words = statusText(facts);
  const line = explanation(facts);
  const settled = isStatusSettled(facts) && waiting.length === 0;
  const signInExpired =
    !facts.neverSynced &&
    facts.network === "online" &&
    facts.server === "sign_in";
  return (
    <>
      <Part className="gap-1">
        <PopoverTitle className="text-title font-semibold">
          {SYNC_CENTRE_WORDS.title}
        </PopoverTitle>
        {line === null ? null : <p className="text-fg-muted">{line}</p>}
      </Part>
      {words.tone === "alert" ? (
        <Part>
          <div className="flex items-start gap-2">
            <SaveOffIcon
              aria-hidden="true"
              className="mt-0.5 size-icon shrink-0 text-danger"
            />
            <p role="alert" className="font-medium text-danger">
              {words.device ?? words.server}
            </p>
          </div>
          <CommandAction
            commandId="doc.export"
            label={SYNC_CENTRE_WORDS.exportCopy}
            icon={DownloadIcon}
          />
        </Part>
      ) : null}
      {facts.neverSynced ? (
        <Part>
          <div className="flex items-start gap-2">
            <MonitorDotIcon
              aria-hidden="true"
              className="mt-0.5 size-icon shrink-0 text-fg-muted"
            />
            <p>{SYNC_CENTRE_WORDS.neverSynced(facts.shell === "desktop")}</p>
          </div>
          <CommandButton id="app.signInToSync" variant="outline" size="sm" />
        </Part>
      ) : signInExpired ? (
        <Part>
          <div className="flex items-start gap-2">
            <LogInIcon
              aria-hidden="true"
              className="mt-0.5 size-icon shrink-0 text-attention"
            />
            <p>{SYNC_CENTRE_WORDS.signInExpired}</p>
          </div>
          <CommandButton id="app.signInToSync" variant="outline" size="sm" />
        </Part>
      ) : null}
      {facts.toReview === 0 ? null : (
        <Part className="flex-row flex-wrap items-center justify-between">
          <div className="flex items-center gap-2">
            <TriangleExclamationPointIcon
              aria-hidden="true"
              className="size-icon shrink-0 text-attention"
            />
            <p className="text-attention">
              {SYNC_CENTRE_WORDS.toReview(facts.toReview)}
            </p>
          </div>
          <CommandAction
            commandId="history.review"
            label={SYNC_CENTRE_WORDS.review}
          />
        </Part>
      )}
      {settled ? (
        <Part>
          <div className="flex items-center gap-2">
            <CloudCheckIcon
              aria-hidden="true"
              className="size-icon shrink-0 text-ok"
            />
            <p className="text-fg-muted">{SYNC_CENTRE_WORDS.empty}</p>
          </div>
        </Part>
      ) : waiting.length === 0 ? null : (
        <Part>
          <ul className="flex flex-col gap-1 text-meta tabular-nums">
            {waiting.map((row) => (
              <li key={row.scene}>
                {SYNC_CENTRE_WORDS.waitingInScene(row.scene, row.count)}
              </li>
            ))}
          </ul>
        </Part>
      )}
      {receipts.length === 0 ? null : (
        <Part>
          <ul className="flex flex-col gap-2">
            {receipts.toReversed().map((receipt, index) => (
              <li key={`${receipt.id}-${index}`}>{receipt.text}</li>
            ))}
          </ul>
        </Part>
      )}
      {words.tone === "alert" ? null : (
        <Part className="sticky bottom-0 bg-chrome py-2">
          <CommandAction
            commandId="doc.export"
            label={SYNC_CENTRE_WORDS.exportCopy}
            icon={DownloadIcon}
          />
        </Part>
      )}
    </>
  );
}
