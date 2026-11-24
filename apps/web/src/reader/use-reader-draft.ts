// Loads a sent draft over REST, falls back to a reader-scoped offline cache, and runs Changes since you last read.
import type { DraftOpenResponse } from "@manent/sync-protocol";
import { READER_WORDS, formatDate, formatDay } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { changedPageLabels } from "./reader-compare.ts";
import { registerReaderSinceLastRead } from "./reader-controller.ts";
import { createReaderRequests } from "./reader-requests.ts";
import {
  readAnonLastRead,
  readCachedDraft,
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
  readonly runSinceLastRead: () => void;
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
        setState({ kind: "refused", reason: "link_expired" });
        return;
      }
      if (answer.code === "not_sent") {
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
      setState({ kind: "refused", reason: "link_revoked" });
    });

    return () => {
      active = false;
    };
  }, [token, userId, bearerToken, signedIn, requests, environment]);

  const runSinceLastRead = useCallback((): void => {
    if (state.kind !== "ready") return;
    if (
      state.previousReadVersionId === null ||
      state.offlineOpenedAt !== null
    ) {
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
      const pages = changedPageLabels(answer.value.content, currentContent);
      messageQueue.push({
        id: "reader.sinceLastRead.result",
        text:
          pages === null
            ? READER_WORDS.noChangesSinceLastRead
            : READER_WORDS.pagesChangedSinceLastRead(pages),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    });
  }, [state, token, requests, messageQueue]);

  useEffect(
    () => registerReaderSinceLastRead(runSinceLastRead),
    [runSinceLastRead],
  );

  return { state, runSinceLastRead };
}
