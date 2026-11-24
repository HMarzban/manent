// The DraftEvents port for episode writes: turns named, sent and issued draft commits into project-index updates.
import { ladderLabelOf, readGroups, readProjectMap } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { SETTINGS } from "@manent/settings";
import type { DraftEvents } from "../history/draft-events.ts";
import { isLocked } from "../production/state.ts";
import {
  projectSettingsOf,
  projectTargetOf,
  versionPageCount,
} from "./episode-writes.ts";
import type { EpisodeWrites } from "./episode-writes.ts";

const SERIES_LADDER: readonly string[] = Object.freeze([
  "Writer's First",
  "Studio",
  "Network",
  "Table",
  "White",
]);

const ANIMATION_LADDER: readonly string[] = Object.freeze([
  ...SERIES_LADDER,
  "Record",
  "Animatic",
  "Conformed",
]);

const NO_LADDER: readonly string[] = Object.freeze([]);

const TEMPLATE_LADDERS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    drama: SERIES_LADDER,
    single_camera: SERIES_LADDER,
    multi_camera: SERIES_LADDER,
    custom: SERIES_LADDER,
    animation: ANIMATION_LADDER,
  });

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** The active draft ladder of the project index: its own `project.ladder` when set, else its template's default. */
function projectLadderOf(indexDoc: CrdtDoc): readonly string[] {
  const ladderMap = readProjectMap(indexDoc, "ladder");
  if (Object.hasOwn(ladderMap, "project.ladder")) {
    const parsed = SETTINGS.get("project.ladder").type.parse(
      ladderMap["project.ladder"],
    );
    if (parsed.ok && isStringArray(parsed.value)) return parsed.value;
  }
  const template = readProjectMap(indexDoc, "template")["project.template"];
  return typeof template === "string" &&
    Object.hasOwn(TEMPLATE_LADDERS, template)
    ? TEMPLATE_LADDERS[template]!
    : NO_LADDER;
}

/** The round name opened for a send's groups (matching the newest round created when multiple groups are sent to). */
function roundNameOfSend(
  indexDoc: CrdtDoc,
  groupIds: readonly string[],
): string | null {
  if (groupIds.length === 0) return null;
  const groups = readGroups(indexDoc);
  for (let i = groupIds.length - 1; i >= 0; i -= 1) {
    const group = groups.get(groupIds[i]!);
    if (group !== undefined) return group.name;
  }
  return null;
}

/**
 * Implements `DraftEvents` over `writes`: each callback reads server-held rows, returns synchronously and never throws.
 */
export function createEpisodeDraftEvents(writes: EpisodeWrites): DraftEvents {
  const { storage, log, update } = writes;
  const safe = (run: () => void): void => {
    try {
      run();
    } catch (error) {
      log(error);
    }
  };
  return {
    named(docId, versionId) {
      safe(() => {
        const target = projectTargetOf(storage, docId);
        if (target === null) return;
        const version = target.file.history.get(versionId);
        if (
          version === null ||
          version.docId !== docId ||
          version.kind !== "named" ||
          version.name === null
        )
          return;
        const draftName = version.name;
        update(target, docId, version.createdByUserId, (indexDoc, ep) => {
          const ladder = projectLadderOf(indexDoc);
          const stage = ladderLabelOf(draftName, ladder) ?? draftName;
          const pages = versionPageCount(
            target.file,
            docId,
            versionId,
            projectSettingsOf(indexDoc),
          );
          return { ...ep, stage, pages };
        });
      });
    },
    sent(docId, versionId) {
      safe(() => {
        const target = projectTargetOf(storage, docId);
        if (target === null) return;
        const version = target.file.history.get(versionId);
        if (
          version === null ||
          version.docId !== docId ||
          version.kind !== "sent"
        )
          return;
        const sendRow = target.file.sharing
          .sendsOf(docId)
          .find((row) => row.versionId === versionId);
        if (sendRow === undefined) return;
        update(target, docId, sendRow.sentByUserId, (indexDoc, ep) => {
          const ladder = projectLadderOf(indexDoc);
          const stage =
            roundNameOfSend(indexDoc, sendRow.groupIds) ??
            ladderLabelOf(sendRow.name, ladder) ??
            sendRow.name;
          const pages = versionPageCount(
            target.file,
            docId,
            versionId,
            projectSettingsOf(indexDoc),
          );
          return { ...ep, stage, pages };
        });
      });
    },
    issued(docId, setId, userId) {
      safe(() => {
        const target = projectTargetOf(storage, docId);
        if (target === null) return;
        const set = target.file.production
          .sets(docId)
          .find((row) => row.id === setId);
        if (
          set === undefined ||
          set.docId !== docId ||
          set.issuedAt === null ||
          set.issuedVersionId === null
        )
          return;
        const { name: stage, issuedVersionId } = set;
        const locked = isLocked(target.file, docId);
        update(target, docId, set.issuedByUserId ?? userId, (indexDoc, ep) => {
          const pages = versionPageCount(
            target.file,
            docId,
            issuedVersionId,
            projectSettingsOf(indexDoc),
          );
          return { ...ep, stage, pages, locked };
        });
      });
    },
  };
}
