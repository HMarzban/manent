// Strict editor/owner access verification, project groups, and workspace people for Send draft.
import { readGroups } from "@manent/crdt";
import type { CrdtDoc, GroupEntry } from "@manent/crdt";
import type { DocRole, SignInChoice } from "@manent/sync-protocol";
import { createValue, useSubscribable } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useEffect, useMemo, useState } from "react";
import { useOpenDocument } from "../screens/document/open-document.ts";
import { useOfferedTo } from "../send/export-form.tsx";
import type { OfferedTo } from "../send/file-types.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { readPerson, tabStorage } from "../session.ts";
import { clearDraftSends } from "./sends.ts";

export interface DraftSendAccess {
  readonly available: boolean;
  readonly ready: boolean;
  readonly pending: boolean;
  readonly online: boolean;
  readonly offered: OfferedTo;
}

type ServerRoleState = "pending" | "editor" | "denied" | "unverified";

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

const NO_PROJECT: Subscribable<string | null> = createValue(null);
const EMPTY_GROUPS: readonly GroupEntry[] = Object.freeze([]);
const NO_ROLE: DocRole | null = null;

const isEditorRole = (role: DocRole | null): boolean =>
  role === "owner" || role === "edit";

/**
 * Verifies editor/owner access from both local document status and `/api/docs/describe`
 * before SendDraftBody ever mounts or reads `/api/drafts/sends`.
 */
export function useDraftSendAccess(docId: string): DraftSendAccess {
  const services = useServices();
  const env = useEnvironment();
  const offered = useOfferedTo(docId);
  const opened = useOpenDocument(docId);
  const status = useSubscribable(opened?.status ?? DEFAULT_STATUS);
  const online = env.online() && status.network === "online";

  const person = readPerson(tabStorage());
  const authenticated =
    person !== null && person.userId === services.userId && person.token !== "";

  const [roleResult, setRoleResult] = useState<{
    docId: string;
    userId: string;
    online: boolean;
    state: ServerRoleState;
  } | null>(null);

  useEffect(() => {
    if (!online || !authenticated) return undefined;
    let current = true;
    void services.api.role(docId).then(
      (role) => {
        if (!current) return;
        const state: ServerRoleState = isEditorRole(role)
          ? "editor"
          : role === NO_ROLE && status.neverSynced
            ? "unverified"
            : "denied";
        if (state === "denied") clearDraftSends(services, docId);
        setRoleResult({
          docId,
          userId: services.userId,
          online,
          state,
        });
      },
      () => {
        if (!current) return;
        setRoleResult({
          docId,
          userId: services.userId,
          online,
          state: "unverified",
        });
      },
    );
    return () => {
      current = false;
    };
  }, [services, docId, online, authenticated, status.neverSynced]);

  const roleState: ServerRoleState = !authenticated
    ? "denied"
    : !online
      ? "unverified"
      : roleResult !== null &&
          roleResult.docId === docId &&
          roleResult.userId === services.userId &&
          roleResult.online === online
        ? roleResult.state
        : "pending";

  const scriptAllowed =
    offered.docKind === "script" && offered.format !== "ink";
  const statusEditable =
    opened !== null &&
    status.access === "edit" &&
    status.server !== "access_removed" &&
    status.server !== "deleted";

  useEffect(() => {
    if (
      !scriptAllowed ||
      (opened !== null && !statusEditable) ||
      roleState === "denied"
    )
      clearDraftSends(services, docId);
  }, [services, docId, scriptAllowed, opened, statusEditable, roleState]);

  const available =
    scriptAllowed &&
    roleState !== "denied" &&
    (opened === null || statusEditable);
  const ready =
    opened !== null &&
    scriptAllowed &&
    statusEditable &&
    (roleState === "editor" ||
      (roleState === "unverified" && !online && authenticated));
  const pending = opened === null || roleState === "pending";

  return { available, ready, pending, online, offered };
}

const readGroupList = (doc: CrdtDoc): readonly GroupEntry[] => [
  ...readGroups(doc).values(),
];

/** Reads `docId`'s project groups once its project id resolves; empty until then. */
export function useProjectGroups(docId: string): readonly GroupEntry[] {
  const { library, projectIndex } = useServices();
  const projectSub = useMemo(
    () => (docId ? library.documentProject(docId) : NO_PROJECT),
    [library, docId],
  );
  const projectId = useSubscribable(projectSub);
  const [groups, setGroups] = useState<readonly GroupEntry[]>(EMPTY_GROUPS);

  useEffect(() => {
    if (projectId === null) {
      setGroups(EMPTY_GROUPS);
      return undefined;
    }
    const index = projectIndex(projectId);
    let shown = true;
    let stop = (): void => {};
    const update = async (): Promise<void> => {
      const doc = (await index.handle()).doc();
      if (shown) setGroups(readGroupList(doc));
    };
    void index.map("groups").then(
      (view) => {
        if (!shown) return;
        stop = view.subscribe(() => void update());
        void update();
      },
      () => {
        // an index that cannot open leaves groups empty
      },
    );
    return () => {
      shown = false;
      stop();
      void index.close();
    };
  }, [projectIndex, projectId]);

  return groups;
}

export function useWorkspacePeople(userId: string): readonly SignInChoice[] {
  const { api } = useServices();
  const [choices, setChoices] = useState<readonly SignInChoice[]>([]);
  useEffect(() => {
    let current = true;
    void api.choices().then(
      (list) => {
        if (!current) return;
        setChoices(
          list.filter((entry) => entry.registered && entry.userId !== userId),
        );
      },
      () => {
        if (current) setChoices([]);
      },
    );
    return () => {
      current = false;
    };
  }, [api, userId]);
  return choices;
}
