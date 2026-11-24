// The seed driver's sharing: project groups, share grants, sent drafts, draft links and reader reads.
import { createHash } from "node:crypto";
import {
  ORIGIN_REMOTE,
  createDoc,
  mergeUpdates,
  startRound,
  writeGroup,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { SeedDriverError } from "@manent/demo";
import type { SeedSharing, SeedWorkspaceId } from "@manent/demo";
import { findGroups, readProjectGroups } from "@manent/server-core";
import type { DraftSendRow } from "@manent/storage";
import {
  DOC_ROLES,
  commentsDocId,
  docIdV7,
  indexDocId,
  projectHome,
} from "@manent/sync-protocol";
import type { Driving } from "./driving.ts";
import { isFields } from "./link.ts";
import { SEED_CALLER, SEED_HOST } from "./server.ts";

interface SendResult {
  readonly sendId: string;
  readonly versionId: string;
  readonly recipientToken: string | null;
  readonly linkToken: string | null;
}

const V7_RANDOM_BYTES = 10;
const TOKEN_BYTES = 32;
const LINK_MARKER = "link";

const nextId = (d: Driving): string =>
  docIdV7(d.target.clock.now(), d.bytes(V7_RANDOM_BYTES));

const nextToken = (d: Driving): string =>
  Buffer.from(d.bytes(TOKEN_BYTES)).toString("base64url");

const hashToken = (token: string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(token).digest());

async function ensureProjectIndex(
  d: Driving,
  userId: string,
  project: { projectId: string; workspaceId: SeedWorkspaceId },
): Promise<string> {
  const docId = indexDocId("project", project.projectId);
  if (d.target.storage.directory.placeOf(docId) === null) {
    await d.call(userId, {
      method: "POST",
      path: "/api/docs",
      body: {
        docId,
        kind: "index",
        home: projectHome(project.projectId),
        workspaceId: project.workspaceId,
      },
    });
  }
  return docId;
}

async function pushDoc(
  d: Driving,
  userId: string,
  docId: string,
  fn: (doc: CrdtDoc) => void,
): Promise<void> {
  const link = await d.link(userId);
  const doc = createDoc({ clientId: d.clientId() });
  const { state } = await link.subscribe(docId, doc.clientId);
  try {
    doc.applyUpdate(state, ORIGIN_REMOTE);
    const made: Uint8Array[] = [];
    const stop = doc.subscribe((update) => made.push(update));
    try {
      fn(doc);
    } finally {
      stop();
    }
    if (made.length > 0) await link.push(docId, mergeUpdates(made));
  } finally {
    await link.unsubscribe(docId);
    doc.destroy();
    await d.runDue();
  }
}

function readSendAnswer(body: unknown, path: string): SendResult {
  if (!isFields(body) || !isFields(body.send))
    throw new SeedDriverError("unavailable", `${path} gave no send`);
  const { sendId, versionId } = body.send;
  if (typeof sendId !== "string" || typeof versionId !== "string")
    throw new SeedDriverError("unavailable", `${path} gave invalid send`);
  return {
    sendId,
    versionId,
    recipientToken:
      typeof body.recipientToken === "string" ? body.recipientToken : null,
    linkToken: typeof body.linkToken === "string" ? body.linkToken : null,
  };
}

async function callOpenDraft(
  d: Driving,
  userId: string | null,
  token: string,
): Promise<unknown> {
  if (userId !== null)
    return d.call(userId, {
      method: "POST",
      path: "/api/drafts/open",
      body: { token },
    });
  const response = await d.target.server.fetch(
    new Request(`http://${SEED_HOST}/api/drafts/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }),
    SEED_CALLER,
  );
  if (response === null)
    throw new SeedDriverError("unavailable", "/api/drafts/open was upgraded");
  const body: unknown = await response.json().catch(() => null);
  if (response.status !== 200)
    throw new SeedDriverError(
      "refused",
      `POST /api/drafts/open anonymously: ${response.status}`,
    );
  return body;
}

/** Expands group and direct recipients and their watermark flags for a historical send. */
function expandSendRecipients(
  d: Driving,
  request: Parameters<SeedSharing["sendVersion"]>[1],
) {
  const projectGroups = readProjectGroups(d.target.storage, request.docId);
  for (const groupId of request.groupIds)
    if (!projectGroups.has(groupId))
      throw new SeedDriverError(
        "refused",
        `group ${groupId} not found for ${request.docId}`,
      );
  const groups = findGroups(d.target.storage, request.docId, [
    ...request.groupIds,
  ]);
  const recipients = new Set<string>(request.recipientUserIds);
  const watermarked = new Set<string>();
  for (const group of groups) {
    for (const memberId of group.memberUserIds) {
      recipients.add(memberId);
      if (group.watermark) watermarked.add(memberId);
    }
  }
  const recipientUserIds = [...recipients].toSorted();
  const watermarkedUserIds = request.watermark
    ? recipientUserIds
    : recipientUserIds.filter((id) => watermarked.has(id));
  return { groups, recipientUserIds, watermarkedUserIds };
}

/** Records a historical send of an existing version, opening rounds and storing deterministic draft links. */
async function sendExistingVersion(
  d: Driving,
  userId: string,
  request: Parameters<SeedSharing["sendVersion"]>[1],
): Promise<SendResult> {
  const { storage, sync, clock } = d.target;
  const place = storage.directory.placeOf(request.docId);
  if (place === null)
    throw new SeedDriverError("unavailable", `${request.docId} is not placed`);
  const file = storage.open(place.home);
  const version = file.history.get(request.versionId);
  if (version === null || version.docId !== request.docId)
    throw new SeedDriverError(
      "refused",
      `version ${request.versionId} not found on ${request.docId}`,
    );
  const { groups, recipientUserIds, watermarkedUserIds } = expandSendRecipients(
    d,
    request,
  );
  const sendId = nextId(d);
  const sentAt = clock.now();
  const storedFiles =
    request.link !== null
      ? [...new Set(request.files), LINK_MARKER]
      : [...new Set(request.files)];
  const sendRow: DraftSendRow = {
    id: sendId,
    docId: request.docId,
    versionId: request.versionId,
    name: request.name,
    groupIds: groups.map((group) => group.id),
    recipientUserIds,
    watermarkedUserIds,
    files: storedFiles,
    what: request.what,
    againstVersionId: request.againstVersionId,
    sentByUserId: userId,
    sentAt,
  };
  if (groups.length > 0) {
    const commentsId = commentsDocId(request.docId);
    if (storage.directory.placeOf(commentsId) === null) {
      await d.call(userId, {
        method: "POST",
        path: "/api/docs",
        body: {
          docId: commentsId,
          kind: "comments",
          home: `${place.home.kind}:${place.home.id}`,
          scriptDocId: request.docId,
        },
      });
    }
    const written = await sync.authorityWrite(commentsId, {
      userId,
      origin: "system",
      edit(doc) {
        for (const group of groups)
          startRound(
            doc,
            {
              roundId: nextId(d),
              name: group.name,
              versionId: request.versionId,
            },
            () => sentAt,
          );
        return { ok: true };
      },
      inTransaction(txFile) {
        txFile.sharing.addSend(sendRow);
      },
    });
    if (!written.ok)
      throw new SeedDriverError(
        "refused",
        `sendVersion on ${request.docId}: ${written.code === "refused" ? written.reason : written.code}`,
      );
  } else {
    file.transaction(() => file.sharing.addSend(sendRow));
  }
  const hasRecipients = groups.length > 0 || recipientUserIds.length > 0;
  const recipientToken = hasRecipients
    ? (request.recipientToken ?? nextToken(d))
    : null;
  const linkToken = request.link !== null ? nextToken(d) : null;
  if (recipientToken !== null)
    storage.shareLinks.addDraftLink({
      id: nextId(d),
      sendId,
      tokenHash: hashToken(recipientToken),
      signIn: true,
      expiresAt: null,
    });
  if (linkToken !== null && request.link !== null)
    storage.shareLinks.addDraftLink({
      id: nextId(d),
      sendId,
      tokenHash: hashToken(linkToken),
      signIn: request.link.signIn,
      expiresAt:
        request.link.expiresInMs === null
          ? null
          : sentAt + request.link.expiresInMs,
    });
  await d.runDue();
  return { sendId, versionId: request.versionId, recipientToken, linkToken };
}

/** Sharing driver over project index groups, `/api/share/*`, and `/api/drafts/*`. */
export function createSharingDriver(d: Driving): SeedSharing {
  const post = async (userId: string, path: string, body: object) => {
    const answer = await d.call(userId, { method: "POST", path, body });
    await d.runDue();
    return answer;
  };
  return {
    async setGroups(userId, project, groups) {
      const indexId = await ensureProjectIndex(d, userId, project);
      await pushDoc(d, userId, indexId, (doc) => {
        for (const group of groups) writeGroup(doc, group);
      });
    },
    async grant(userId, docId, targetUserId, role) {
      await post(userId, "/api/share/grant", {
        docId,
        userId: targetUserId,
        role,
      });
    },
    async remove(userId, docId, targetUserId) {
      await post(userId, "/api/share/remove", { docId, userId: targetUserId });
    },
    async grantGroup(userId, docId, groupId) {
      const answer = await post(userId, "/api/share/grant-group", {
        docId,
        groupId,
      });
      const skipped =
        isFields(answer) && Array.isArray(answer.skipped)
          ? answer.skipped.filter((v): v is string => typeof v === "string")
          : [];
      return { skipped };
    },
    async removeGroup(userId, docId, groupId) {
      await post(userId, "/api/share/remove-group", { docId, groupId });
    },
    async createShareLink(userId, docId, role, expiresInMs) {
      const answer = await post(userId, "/api/share/link", {
        docId,
        role,
        expiresInMs,
      });
      if (
        !isFields(answer) ||
        !isFields(answer.link) ||
        typeof answer.link.id !== "string" ||
        typeof answer.token !== "string"
      )
        throw new SeedDriverError(
          "unavailable",
          "/api/share/link gave no token",
        );
      return { linkId: answer.link.id, token: answer.token };
    },
    async joinShareLink(userId, token) {
      const answer = await post(userId, "/api/share/join", { token });
      const role = isFields(answer)
        ? DOC_ROLES.find((r) => r === answer.role)
        : undefined;
      if (
        !isFields(answer) ||
        typeof answer.docId !== "string" ||
        role === undefined ||
        typeof answer.joined !== "boolean"
      )
        throw new SeedDriverError("unavailable", "/api/share/join gave no doc");
      return { docId: answer.docId, role, joined: answer.joined };
    },
    async sendDraft(userId, request) {
      const answer = await post(userId, "/api/drafts/send", {
        ...request,
        key: d.key(),
        files: [...request.files],
        groupIds: [...request.groupIds],
        recipientUserIds: [...request.recipientUserIds],
      });
      return readSendAnswer(answer, "/api/drafts/send");
    },
    sendVersion: (userId, request) => sendExistingVersion(d, userId, request),
    async openDraftLink(userId, token) {
      const answer = await callOpenDraft(d, userId, token);
      if (
        !isFields(answer) ||
        typeof answer.docId !== "string" ||
        typeof answer.sendId !== "string" ||
        typeof answer.versionId !== "string"
      )
        throw new SeedDriverError(
          "unavailable",
          "/api/drafts/open gave invalid answer",
        );
      await d.runDue();
      return {
        docId: answer.docId,
        sendId: answer.sendId,
        versionId: answer.versionId,
        lastReadVersionId:
          typeof answer.lastReadVersionId === "string"
            ? answer.lastReadVersionId
            : null,
      };
    },
    async recordLastRead(userId, docId, versionId) {
      const place = d.target.storage.directory.placeOf(docId);
      if (place === null)
        throw new SeedDriverError("unavailable", `${docId} is not placed`);
      d.target.storage.open(place.home).sharing.putRead({
        docId,
        userId,
        versionId,
        readAt: d.target.clock.now(),
      });
    },
  };
}
