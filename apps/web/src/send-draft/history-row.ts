// History row extension for sent drafts: recipient summary, open count, and opener tooltip for owner and editors only.
import type { DraftSendItem } from "@manent/sync-protocol";
import { DRAFTS_WORDS, createValue, useSubscribable } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useMemo } from "react";
import type { RowExtension, RowLine } from "../history/row-extensions.ts";
import { useOpenDocument } from "../screens/document/open-document.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { readPerson } from "../session.ts";
import { draftSendsOf, findSendForVersion, useDraftSends } from "./sends.ts";

const DEFAULT_STATUS: Subscribable<StatusFacts> = createValue<StatusFacts>({
  access: "view",
  device: "ok",
  network: "online",
  server: "syncing",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: false,
  shell: "web",
  toReview: 0,
  now: 0,
});

function useCanSeeDraftSends(docId: string): boolean {
  const services = useServices();
  const { tabStorage } = useEnvironment();
  const opened = useOpenDocument(docId);
  const status = useSubscribable(opened?.status ?? DEFAULT_STATUS);
  const person = readPerson(tabStorage);
  const authenticated =
    person !== null &&
    person.userId === services.userId &&
    person.token !== null &&
    person.token !== "";
  return (
    authenticated &&
    opened !== null &&
    status.access === "edit" &&
    status.server !== "access_removed" &&
    status.server !== "deleted"
  );
}

function openerSummaryOf(send: DraftSendItem): string | null {
  if (send.groups.length === 0 && send.recipientCount === 0 && !send.hasLink)
    return null;
  if (send.openerNames.length > 0)
    return DRAFTS_WORDS.sentHistoryOpenedBy(send.openerNames);
  if (
    send.openedCount === 0 &&
    (send.recipientCount > 0 || send.totalOpens === 0)
  )
    return DRAFTS_WORDS.sentHistoryNotOpenedYet;
  return null;
}

function directCountOf(send: DraftSendItem): number | null {
  if (!("directRecipientCount" in send)) return null;
  const raw: unknown = send.directRecipientCount;
  return typeof raw === "number" ? raw : null;
}

function formatSentHistoryRow(send: DraftSendItem): RowLine {
  const text = DRAFTS_WORDS.sentHistoryRow({
    groups: send.groups,
    recipientCount: send.recipientCount,
    directRecipientCount: directCountOf(send),
    openedCount: send.openedCount,
    totalOpens: send.totalOpens,
    hasLink: send.hasLink,
  });
  const opener = openerSummaryOf(send);
  return {
    text,
    tooltip: opener === null ? text : `${text} · ${opener}`,
  };
}

export const sendDraftHistoryRow: RowExtension = {
  useList(docId) {
    const canEdit = useCanSeeDraftSends(docId);
    useDraftSends(docId, canEdit);
  },
  useLine(docId, item) {
    const services = useServices();
    const store = useMemo(
      () => draftSendsOf(services, docId),
      [services, docId],
    );
    const state = useSubscribable(store);
    if (item.kind !== "sent" || state.status !== "ready") return null;
    const send = findSendForVersion(state.sends, item.id);
    return send === null ? null : formatSentHistoryRow(send);
  },
  line: () => null,
  menu: () => [],
};
