// Loads a sent draft over REST, falls back to a reader-scoped offline cache, and runs Changes since you last read.
import type { Comparison } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import type { DraftOpenResponse } from "@manent/sync-protocol";
import {
  DIALOG_WORDS,
  DRAFTS_WORDS,
  READER_WORDS,
  formatDate,
  formatDay,
} from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { compareDrafts } from "./reader-compare.ts";
import { registerReaderSinceLastRead } from "./reader-controller.ts";
import { createReaderRequests } from "./reader-requests.ts";
import {
  readAnonLastRead,
  readCachedDraft,
  removeCachedDraft,
  writeAnonLastRead,
  writeCachedDraft,
} from "./reader-storage.ts";
import type { Environment } from "../services/ports.ts";
import type { PersonStore } from "../state/person.store.ts";
import { TEXT } from "../text.ts";

export type ReaderRefusal =
  "link_expired" | "link_revoked" | "not_sent" | "unreachable";

export type ReaderLoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "needs_sign_in" }
  | { readonly kind: "refused"; readonly reason: ReaderRefusal }
  | {
      readonly kind: "ready";
      readonly draft: DraftOpenResponse;
      readonly previousReadVersionId: string | null;
      readonly offlineOpenedAt: number | null;
    };

export const formatReaderDayDate = (at: number): string =>
  `${formatDay(at)} ${formatDate(at)}`;

export function readerRefusalText(reason: ReaderRefusal): string {
  switch (reason) {
    case "link_expired":
      return READER_WORDS.linkExpired;
    case "link_revoked":
      return READER_WORDS.linkRevoked;
    case "not_sent":
      return READER_WORDS.notSent;
    case "unreachable":
      return TEXT.chooseUnreachable;
  }
}

export interface ActiveReaderComparison {
  readonly baseline: DocJSON;
  readonly comparison: Comparison;
  readonly baselineName: string;
}

export function useReaderDraft(options: {
  token: string;
  fetch: typeof fetch;
  usePerson: PersonStore;
  environment: Environment;
  messageQueue: MessageQueue;
  userId: string | null;
  bearerToken: string | null;
  signedIn: boolean;
}): {
  readonly state: ReaderLoadState;
  readonly comparison: ActiveReaderComparison | null;
  readonly runSinceLastRead: () => void;
  readonly hideComparison: () => void;
} {
  const {
    token,
    fetch: fetchFn,
    usePerson,
    environment,
    messageQueue,
    userId,
    bearerToken,
    signedIn,
  } = options;
  const [state, setState] = useState<ReaderLoadState>({ kind: "loading" });
  const [comparison, setComparison] = useState<ActiveReaderComparison | null>(
    null,
  );

  const requests = useMemo(
    () =>
      createReaderRequests({
        fetch: fetchFn,
        token: () => usePerson.getState().person?.token ?? null,
      }),
    [fetchFn, usePerson],
  );

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    setComparison(null);

    void requests.open(token).then((answer) => {
      if (!active) return;
      if (answer.ok) {
        const draft = answer.value;
        let previousReadVersionId = draft.lastReadVersionId;
        if (!signedIn) {
          const stored = readAnonLastRead(environment.storage, draft.docId);
          previousReadVersionId =
            stored !== null && stored !== draft.versionId ? stored : null;
          writeAnonLastRead(environment.storage, draft.docId, draft.versionId);
        }
        writeCachedDraft(
          environment.storage,
          token,
          userId,
          environment.now(),
          draft,
        );
        setState({
          kind: "ready",
          draft,
          previousReadVersionId,
          offlineOpenedAt: null,
        });
        return;
      }
      if (answer.code === "unauthenticated") {
        setState({ kind: "needs_sign_in" });
        return;
      }
      if (answer.code === "link_expired") {
        removeCachedDraft(environment.storage, token, userId);
        setState({ kind: "refused", reason: "link_expired" });
        return;
      }
      if (answer.code === "not_sent") {
        removeCachedDraft(environment.storage, token, userId);
        setState({ kind: "refused", reason: "not_sent" });
        return;
      }
      if (answer.code === "unreachable" || answer.code === "refused") {
        const cached = readCachedDraft(environment.storage, token, userId);
        if (cached !== null) {
          setState({
            kind: "ready",
            draft: cached.draft,
            previousReadVersionId: null,
            offlineOpenedAt: cached.openedAt,
          });
          return;
        }
        setState({ kind: "refused", reason: "unreachable" });
        return;
      }
      removeCachedDraft(environment.storage, token, userId);
      setState({ kind: "refused", reason: "link_revoked" });
    });

    return () => {
      active = false;
    };
  }, [token, userId, bearerToken, signedIn, requests, environment]);

  const runSinceLastRead = useCallback((): void => {
    if (state.kind !== "ready") return;
    if (state.offlineOpenedAt !== null) {
      messageQueue.push({
        id: "reader.sinceLastRead.offline",
        text: DIALOG_WORDS.disabledLine(
          READER_WORDS.sinceLastRead,
          DRAFTS_WORDS.needsConnection,
        ),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
      return;
    }
    if (state.previousReadVersionId === null) {
      messageQueue.push({
        id: "reader.sinceLastRead.none",
        text: READER_WORDS.sinceLastReadReasonMessage,
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
      return;
    }
    const earlierId = state.previousReadVersionId;
    const currentContent = state.draft.content;
    void requests.since(token, earlierId).then((answer) => {
      if (!answer.ok) {
        const text =
          answer.code === "unreachable"
            ? TEXT.chooseUnreachable
            : READER_WORDS.sinceLastReadReasonMessage;
        messageQueue.push({
          id: "reader.sinceLastRead.unavailable",
          text,
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
        return;
      }
      const compared = compareDrafts(answer.value.content, currentContent);
      if (compared !== null)
        setComparison({
          baseline: compared.baseline,
          comparison: compared.comparison,
          baselineName: answer.value.name ?? "",
        });
      messageQueue.push({
        id: "reader.sinceLastRead.result",
        text:
          compared === null
            ? READER_WORDS.noChangesSinceLastRead
            : READER_WORDS.pagesChangedSinceLastRead(compared.pages),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    });
  }, [state, token, requests, messageQueue]);

  const hideComparison = useCallback((): void => {
    setComparison(null);
  }, []);

  useEffect(
    () => registerReaderSinceLastRead(runSinceLastRead),
    [runSinceLastRead],
  );

  return { state, comparison, runSinceLastRead, hideComparison };
}
