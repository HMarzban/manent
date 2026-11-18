// The Sync centre: what is saved where, what waits by scene, what is to review and the receipts. It holds no state.
import {
  CommandButton,
  PopoverTitle,
  SYNC_CENTRE_WORDS,
  statusText,
  useSubscribable,
} from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { CommandAction } from "./status-bar.tsx";

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

export function SyncCentre(props: { doc: DocumentServices }): ReactNode {
  const { doc } = props;
  const { messages } = useServices();
  const facts = useSubscribable(doc.status);
  const waiting = useSubscribable(doc.waitingByScene);
  const receipts = useSyncExternalStore(messages.subscribe, messages.receipts);
  const words = statusText(facts);
  const line = explanation(facts);
  const settled =
    !facts.neverSynced && waiting.length === 0 && facts.toReview === 0;
  return (
    <>
      <PopoverTitle className="text-heading">
        {SYNC_CENTRE_WORDS.title}
      </PopoverTitle>
      {words.tone === "alert" ? (
        <div className="flex flex-col items-start gap-1">
          <p>{words.device ?? words.server}</p>
          <CommandAction
            commandId="doc.export"
            label={SYNC_CENTRE_WORDS.exportCopy}
          />
        </div>
      ) : null}
      {facts.neverSynced ? (
        <div className="flex flex-col items-start gap-1">
          <p>{SYNC_CENTRE_WORDS.neverSynced(facts.shell === "desktop")}</p>
          <CommandButton id="app.signInToSync" variant="outline" size="sm" />
        </div>
      ) : null}
      {line === null ? null : <p className="text-fg-muted">{line}</p>}
      {facts.toReview === 0 ? null : (
        <div className="flex items-center gap-2">
          <p>{SYNC_CENTRE_WORDS.toReview(facts.toReview)}</p>
          <CommandAction
            commandId="history.review"
            label={SYNC_CENTRE_WORDS.review}
          />
        </div>
      )}
      {settled ? (
        <p>{SYNC_CENTRE_WORDS.empty}</p>
      ) : (
        <ul className="tabular-nums">
          {waiting.map((row) => (
            <li key={row.scene}>
              {SYNC_CENTRE_WORDS.waitingInScene(row.scene, row.count)}
            </li>
          ))}
        </ul>
      )}
      <ul className="text-meta">
        {receipts.toReversed().map((receipt, index) => (
          <li key={index}>{receipt.text}</li>
        ))}
      </ul>
      <CommandAction
        commandId="doc.export"
        label={SYNC_CENTRE_WORDS.exportCopy}
      />
    </>
  );
}
