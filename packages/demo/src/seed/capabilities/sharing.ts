// What the seed writes of a project's groups, document shares, sent drafts, draft links and reader reads.
import type { GroupEntry } from "@manent/crdt";
import type {
  DocRole,
  SendDraftLinkInput,
  ShareLinkExpiryMs,
  ShareRole,
} from "@manent/sync-protocol";
import type { SeedWorkspaceId } from "../catalogue.ts";

export interface SeedDraftSendResult {
  readonly sendId: string;
  readonly versionId: string;
  readonly recipientToken: string | null;
  readonly linkToken: string | null;
}

export interface SeedSharing {
  /** Ensures the project's index exists and writes `groups` into its `groups` map. */
  setGroups(
    userId: string,
    project: { projectId: string; workspaceId: SeedWorkspaceId },
    groups: readonly GroupEntry[],
  ): Promise<void>;
  /** Gives `targetUserId` `role` on `docId` through POST /api/share/grant. */
  grant(
    userId: string,
    docId: string,
    targetUserId: string,
    role: ShareRole,
  ): Promise<void>;
  /** Removes `targetUserId`'s role on `docId` through POST /api/share/remove. */
  remove(userId: string, docId: string, targetUserId: string): Promise<void>;
  /** Grants the project group `groupId` access to `docId` through POST /api/share/grant-group. */
  grantGroup(
    userId: string,
    docId: string,
    groupId: string,
  ): Promise<{ skipped: readonly string[] }>;
  /** Removes the group grant `groupId` from `docId` through POST /api/share/remove-group. */
  removeGroup(userId: string, docId: string, groupId: string): Promise<void>;
  /** Creates a share link on `docId` through POST /api/share/link. */
  createShareLink(
    userId: string,
    docId: string,
    role: ShareRole,
    expiresInMs: ShareLinkExpiryMs,
  ): Promise<{ linkId: string; token: string }>;
  /** Joins a share link as `userId` through POST /api/share/join. */
  joinShareLink(
    userId: string,
    token: string,
  ): Promise<{ docId: string; role: DocRole; joined: boolean }>;
  /** Sends the current state of `docId` through POST /api/drafts/send. */
  sendDraft(
    userId: string,
    request: {
      docId: string;
      name: string;
      what: string;
      againstVersionId: string | null;
      files: readonly string[];
      groupIds: readonly string[];
      recipientUserIds: readonly string[];
      watermark: boolean;
      link: SendDraftLinkInput | null;
    },
  ): Promise<SeedDraftSendResult>;
  /**
   * Records a historical send of an existing version `versionId` of `docId`, opens a round per
   * named group, and stores deterministic draft links so readers can open and compare it.
   */
  sendVersion(
    userId: string,
    request: {
      docId: string;
      versionId: string;
      name: string;
      what: string;
      againstVersionId: string | null;
      files: readonly string[];
      groupIds: readonly string[];
      recipientUserIds: readonly string[];
      watermark: boolean;
      link: SendDraftLinkInput | null;
      /** Deterministic recipient token for demo seed links; omitted draws from the seed PRNG. */
      recipientToken?: string;
    },
  ): Promise<SeedDraftSendResult>;
  /** Opens a draft link through POST /api/drafts/open, recording the open and updating last-read. */
  openDraftLink(
    userId: string | null,
    token: string,
  ): Promise<{
    docId: string;
    sendId: string;
    versionId: string;
    lastReadVersionId: string | null;
  }>;
  /** Records `versionId` as `userId`'s last-read draft of `docId` at the current seed time. */
  recordLastRead(
    userId: string,
    docId: string,
    versionId: string,
  ): Promise<void>;
}
