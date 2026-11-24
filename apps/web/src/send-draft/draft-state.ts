// Pure derivations and submit helper for the Send draft form.
import type { GroupEntry } from "@manent/crdt";
import type { Pagination } from "@manent/pagination";
import { SHARE_LINK_EXPIRIES_MS } from "@manent/sync-protocol";
import type { DraftSendItem } from "@manent/sync-protocol";
import { DRAFTS_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";
import type { HistoryRow } from "../history/history-rows.ts";
import { proposeDraftName } from "../project/ladder.ts";
import type { ExportFileType } from "../send/script-file.ts";
import type { Environment, PersonServices } from "../services/ports.ts";
import { downloadDraftFiles, encodeWhat, parseWhat } from "./draft-output.ts";
import type { WhatSelection } from "./draft-output.ts";
import { postSendDraft } from "./requests.ts";
import { recordSentDraft } from "./sends.ts";
import type { DraftBaselineOption } from "./what-as-rows.tsx";

export interface RecalledGroupChoices {
  readonly files: readonly string[] | null;
  readonly what: WhatSelection;
  readonly againstVersionId: string | null;
}

/** Sends first (newest first), then named/sent history rows already on the server. */
export function baselinesOf(
  sends: readonly DraftSendItem[],
  historyRows: readonly HistoryRow[],
): readonly DraftBaselineOption[] {
  const seen = new Set<string>();
  const list: DraftBaselineOption[] = [];
  for (const send of sends) {
    if (seen.has(send.versionId)) continue;
    seen.add(send.versionId);
    list.push({ id: send.versionId, name: send.name });
  }
  for (const { item } of historyRows) {
    if (
      (item.kind === "named" || item.kind === "sent") &&
      item.name !== null &&
      !item.onDevice &&
      !seen.has(item.id)
    ) {
      seen.add(item.id);
      list.push({ id: item.id, name: item.name });
    }
  }
  return list;
}

export function proposedDraftName(
  sends: readonly DraftSendItem[],
  historyRows: readonly HistoryRow[],
  ladder: readonly string[],
): string {
  const names = [
    ...historyRows.flatMap(({ item }) =>
      (item.kind === "named" || item.kind === "sent") && item.name !== null
        ? [item.name]
        : [],
    ),
    ...sends.map((send) => send.name),
  ];
  return proposeDraftName(names, ladder);
}

export function distinctRecipientCount(
  selectedGroupIds: readonly string[],
  selectedPeopleIds: readonly string[],
  groups: readonly GroupEntry[],
): number {
  const ids = new Set<string>(selectedPeopleIds);
  for (const gid of selectedGroupIds) {
    const group = groups.find((entry) => entry.id === gid);
    if (group !== undefined)
      for (const uid of group.memberUserIds) ids.add(uid);
  }
  return ids.size;
}

/** Last time's file types, What and baseline for `firstGroupId`, from the newest send that included it. */
export function recallGroupChoices(options: {
  sends: readonly DraftSendItem[];
  firstGroupId: string;
  offeredTypes: readonly ExportFileType[];
  baselines: readonly DraftBaselineOption[];
  pageCount: number;
  sceneCount: number;
}): RecalledGroupChoices | null {
  const {
    sends,
    firstGroupId,
    offeredTypes,
    baselines,
    pageCount,
    sceneCount,
  } = options;
  const remembered = sends.find((send) =>
    send.groups.some((group) => group.groupId === firstGroupId),
  );
  if (remembered === undefined) return null;
  const allowed = new Set([
    ...offeredTypes.map((type) => type.id),
    ...(baselines.length > 0 ? ["pdf_asterisks"] : []),
  ]);
  const files = remembered.files.filter((id) => allowed.has(id));
  const againstVersionId =
    remembered.againstVersionId !== null &&
    baselines.some((b) => b.id === remembered.againstVersionId)
      ? remembered.againstVersionId
      : null;
  return {
    files: files.length > 0 ? files : null,
    what: parseWhat(remembered.what, { pageCount, sceneCount }),
    againstVersionId,
  };
}

export function finishedMessage(options: {
  name: string;
  people: number;
  hasLink: boolean;
  canCopyLink: boolean;
}): Message {
  const { name, people, hasLink, canCopyLink } = options;
  let text: string;
  if (people > 0 && hasLink) text = DRAFTS_WORDS.sentToBoth(name, people);
  else if (people > 0) text = DRAFTS_WORDS.sentToPeople(name, people);
  else if (hasLink) text = DRAFTS_WORDS.sentByLink(name);
  else text = DRAFTS_WORDS.sentAsFile(name);
  return {
    id: "draft.sent",
    text,
    actions: canCopyLink
      ? [{ label: DRAFTS_WORDS.copyDraftLink, commandId: "draft.copyLink" }]
      : [],
    lifetime: "brief",
    ownWork: false,
  };
}

export async function submitSendDraft(options: {
  services: PersonServices;
  now: Environment["now"];
  docId: string;
  key: string;
  title: string;
  name: string;
  multiCamera: boolean;
  what: WhatSelection;
  selectedFiles: readonly string[];
  offeredTypes: readonly ExportFileType[];
  selectedGroupIds: readonly string[];
  selectedPeopleIds: readonly string[];
  needsChangedLines: boolean;
  activeAgainstId: string | null;
  watermarkRequired: boolean;
  watermarkName: string | null;
  linkEnabled: boolean;
  expiryIndex: number;
  askWhoTheyAre: boolean;
  pagination: Pagination;
  pageIndexes: readonly number[];
  changedLines: ReadonlyMap<string, readonly number[]> | null;
}): Promise<{ ok: true; message: Message } | { ok: false }> {
  const {
    services,
    now,
    docId,
    key,
    title,
    name,
    multiCamera,
    what,
    selectedFiles,
    offeredTypes,
    selectedGroupIds,
    selectedPeopleIds,
    needsChangedLines,
    activeAgainstId,
    watermarkRequired,
    watermarkName,
    linkEnabled,
    expiryIndex,
    askWhoTheyAre,
    pagination,
    pageIndexes,
    changedLines,
  } = options;
  const requestWhat: WhatSelection = multiCamera
    ? {
        ...what,
        id: what.id === "changed_pages" ? "changed_pages" : "full_draft",
      }
    : what;
  const answer = await postSendDraft(services.userId, {
    docId,
    key,
    name,
    groupIds: [...selectedGroupIds],
    recipientUserIds: [...selectedPeopleIds],
    files: [...selectedFiles],
    what: encodeWhat(requestWhat),
    againstVersionId: needsChangedLines ? activeAgainstId : null,
    watermark: watermarkRequired,
    link: linkEnabled
      ? {
          expiresInMs: SHARE_LINK_EXPIRIES_MS[expiryIndex] ?? null,
          signIn: askWhoTheyAre,
        }
      : null,
  });
  if (!answer.ok) return { ok: false };

  const token = answer.value.linkToken ?? answer.value.recipientToken;
  const sentLink = token === null ? null : { name, path: `/r/${token}` };
  recordSentDraft(services, docId, answer.value.send, sentLink);

  try {
    await downloadDraftFiles({
      docId,
      title,
      draftName: name,
      pagination,
      pageIndexes,
      selectedFileIds: selectedFiles,
      offeredTypes,
      changedLines,
      watermarkRequired,
      watermarkName,
      now,
    });
  } catch {
    // server send already committed; do not fail or withhold the finished message
  }

  return {
    ok: true,
    message: finishedMessage({
      name,
      people: answer.value.send.recipientCount,
      hasLink: linkEnabled,
      canCopyLink: sentLink !== null,
    }),
  };
}
