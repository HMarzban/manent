// Share's state while it is open: who has access as the server says, what the person may do, and each row's refusal.
import { useSubscribable } from "@manent/ui";
import type { SignInChoice } from "@manent/sync-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useServices } from "../services/context.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { readPerson, tabStorage } from "../session.ts";
import { createShareActions } from "./share-actions.ts";
import type { RowKey, ShareActions } from "./share-actions.ts";
import { createShareRequests } from "./share-requests.ts";
import type { ShareAccess, ShareRequests } from "./share-requests.ts";
import { shareHeld } from "./share-store.ts";

export interface ShareView {
  /** `sign_in`: the script never synced, or the person has no session; `offline`: the last answer heard is listed. */
  state: "ready" | "sign_in" | "offline" | "unavailable";
  /** True while the server is being asked who has access. */
  loading: boolean;
  /** Null until the server first answers. */
  access: ShareAccess | null;
  /** The person owns the script, so only they change who has access. */
  owner: boolean;
  refusals: ReadonlyMap<RowKey, string>;
  /** The people a role may be given to; asked only for the owner. */
  choices: readonly SignInChoice[];
  actions: ShareActions;
  retry(): void;
}

/** This tab's token, while the tab is still `userId`. */
function tokenOf(userId: string): string | null {
  const person = readPerson(tabStorage());
  return person?.userId === userId ? person.token : null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // the browser refused the clipboard: nothing was copied, so nothing is said
    return false;
  }
}

/** Asks who has access each time Share opens online, and the people a role may be given to once the owner is known. */
function useAsked(
  requests: ShareRequests,
  docId: string,
  asking: boolean,
  owner: boolean,
  attempt: number,
): {
  unauthenticated: boolean;
  unavailable: boolean;
  loading: boolean;
  choices: readonly SignInChoice[];
} {
  const { userId } = useServices();
  const held = shareHeld(userId, docId);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(asking);
  const [choices, setChoices] = useState<readonly SignInChoice[]>([]);
  useEffect(() => {
    if (!asking) {
      setLoading(false);
      setUnavailable(false);
      return undefined;
    }
    let shown = true;
    setLoading(true);
    setUnavailable(false);
    void requests
      .access(docId)
      .then(
        (answer) => {
          if (!shown) return;
          const unauth = !answer.ok && answer.code === "unauthenticated";
          setUnauthenticated(unauth);
          setUnavailable(!answer.ok && !unauth);
          if (answer.ok) held.access.set(answer.value);
        },
        () => {
          if (shown) setUnavailable(true);
        },
      )
      .finally(() => {
        if (shown) setLoading(false);
      });
    return () => {
      shown = false;
    };
  }, [requests, docId, asking, held, attempt]);
  useEffect(() => {
    if (!asking || !owner) return undefined;
    let shown = true;
    void requests.choices().then((found) => {
      if (shown) setChoices(found);
    });
    return () => {
      shown = false;
    };
  }, [requests, asking, owner, attempt]);
  return { unauthenticated, unavailable, loading, choices };
}

export function useShare(
  docId: string,
  doc: DocumentServices,
  open: boolean,
): ShareView {
  const services = useServices();
  const { userId } = services;
  const facts = useSubscribable(doc.status);
  const held = shareHeld(userId, docId);
  const access = useSubscribable(held.access);
  const title = useDocumentTitle(docId);
  const titleRef = useRef(title);
  titleRef.current = title;
  const [refusals, setRefusals] = useState<ReadonlyMap<RowKey, string>>(
    () => new Map(),
  );
  const [attempt, setAttempt] = useState(0);
  // what a row refused is said while Share stays open
  useEffect(() => {
    if (!open) setRefusals(new Map());
  }, [open]);
  const requests = useMemo(
    () => createShareRequests({ fetch, token: () => tokenOf(userId) }),
    [userId],
  );
  const offline = facts.network === "offline";
  const owner =
    access?.people.some((p) => p.userId === userId && p.role === "owner") ??
    false;
  const asked = useAsked(
    requests,
    docId,
    open && !offline && !facts.neverSynced,
    owner,
    attempt,
  );
  const actions = useMemo(
    () =>
      createShareActions({
        docId,
        requests,
        held,
        messages: services.messages,
        reverses: services.reverses,
        title: () => titleRef.current,
        refuse(row, sentence) {
          setRefusals((shown) => {
            const next = new Map(shown);
            if (sentence === null) next.delete(row);
            else next.set(row, sentence);
            return next;
          });
        },
        copy: copyText,
        origin: location.origin,
      }),
    [docId, requests, held, services],
  );
  const state =
    facts.neverSynced || asked.unauthenticated
      ? "sign_in"
      : offline
        ? "offline"
        : asked.unavailable && access === null
          ? "unavailable"
          : "ready";
  return {
    state,
    loading: asked.loading,
    access,
    owner,
    refusals,
    choices: asked.choices,
    actions,
    retry: () => setAttempt((n) => n + 1),
  };
}
