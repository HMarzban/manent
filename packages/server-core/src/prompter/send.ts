// Prompter send operations: manual Send, Send previous and automatic send.
import { readRundown, writePrompterState } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { PrompterSendRow, Storage } from "@manent/storage";
import type {
  PrompterSendRequest,
  PrompterSendResponse,
} from "@manent/sync-protocol";
import type { HistoryService } from "../history/service.ts";
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
import type { AirWindows } from "../rundown/air-window.ts";
import type { Clock, SyncService } from "../sync/ports.ts";
import {
  isRowChanged,
  readSendBlocks,
  readStoryHeadBlocks,
  slugBlocksOf,
} from "./projection.ts";
import {
  announcePrompterSent,
  announcePrompterVersion,
  authorizePrompterRequest,
  checkSendableRow,
  createRundownChain,
  createSendTrail,
  mapWriteRefusal,
  nextSentAt,
  replayStoredRequest,
  storePrompterSend,
} from "./send-trail.ts";
import type {
  PreviousStep,
  PrompterOutcome,
  PrompterRefusal,
} from "./send-trail.ts";
import type { PrompterFeedHub } from "./subscribe.ts";

export type { PrompterOutcome, PrompterRefusal };

interface CommittedSend {
  readonly sendRow: PrompterSendRow;
  readonly response: PrompterSendResponse;
}

export interface PrompterSender {
  inChain<T>(rundownId: string, run: () => Promise<T>): Promise<T>;
  send(
    userId: string,
    request: PrompterSendRequest,
  ): Promise<PrompterOutcome<PrompterSendResponse>>;
  sendPrevious(
    userId: string,
    request: PrompterSendRequest,
  ): Promise<PrompterOutcome<PrompterSendResponse>>;
  /** Automatic send outside the air window; records no version. */
  sendAutomatic(
    rundownId: string,
    rowId: string,
    liveStoryDoc: CrdtDoc | null,
  ): Promise<"sent" | "inside_window" | "skipped" | "retry">;
  dropRow(rundownId: string, rowId: string): void;
}

export function createPrompterSender(options: {
  storage: Storage;
  sync: () => SyncService;
  history: Pick<HistoryService, "keep">;
  clock: Clock;
  ids(): string;
  airWindows: Pick<AirWindows, "isInside">;
  feed: PrompterFeedHub;
  cancelAutoSend(rundownId: string, rowId: string): void;
}): PrompterSender {
  const { storage, sync, history, clock, ids, airWindows, feed } = options;
  const inChain = createRundownChain();
  const trail = createSendTrail();

  return {
    inChain,
    async send(userId, request) {
      const preAuth = authorizePrompterRequest(
        storage,
        sync(),
        userId,
        request,
      );
      if (!preAuth.ok) return preAuth;
      const { docId, rowId, key } = request;
      const storageKey = `send:${key}`;
      return inChain(docId, async () => {
        const auth = authorizePrompterRequest(storage, sync(), userId, request);
        if (!auth.ok) return auth;
        const { home, file } = auth;
        const replayed = replayStoredRequest(file, docId, storageKey, userId);
        if (replayed !== null) return replayed;
        const planned: {
          storyId: string;
          versionId: string;
          sentAt: number;
        }[] = [];
        const committed: CommittedSend[] = [];
        const written = await sync().authorityWrite(docId, {
          userId,
          origin: "system",
          edit(doc) {
            const checked = checkSendableRow(
              storage,
              sync(),
              doc,
              home,
              file,
              userId,
              rowId,
            );
            if (!checked.ok) return checked;
            const sentAt = nextSentAt(file, docId, rowId, clock.now());
            const versionId = ids();
            planned.push({ storyId: checked.storyId, versionId, sentAt });
            writePrompterState(doc, rowId, {
              state: "on",
              versionId,
              sentAt,
              sentByUserId: userId,
            });
            return { ok: true };
          },
          inTransaction(inFile) {
            const [item] = planned;
            if (item === undefined) return;
            const { storyId, versionId, sentAt } = item;
            const storyRow = inFile.log.get(storyId);
            if (storyRow === null) return;
            history.keep(inFile, {
              id: versionId,
              docId: storyId,
              generation: storyRow.generation,
              seq: storyRow.headSeq,
              kind: "prompter",
              name: null,
              createdByUserId: userId,
              createdAt: sentAt,
              deviceId: null,
            });
            const sendRow: PrompterSendRow = {
              rundownId: docId,
              rowId,
              storyId,
              versionId,
              generation: storyRow.generation,
              seq: storyRow.headSeq,
              senderUserId: userId,
              sentAt,
            };
            const response = storePrompterSend(inFile, sendRow, {
              key: storageKey,
              userId,
            });
            committed.push({ sendRow, response });
          },
        });
        if (!written.ok)
          return {
            ok: false,
            code:
              written.code === "refused"
                ? mapWriteRefusal(written.reason)
                : "busy",
          };
        const [done] = committed;
        if (done === undefined) return { ok: false, code: "busy" };
        options.cancelAutoSend(docId, rowId);
        trail.record(docId, rowId, done.sendRow);
        if (done.sendRow.versionId !== null)
          announcePrompterVersion(
            sync(),
            done.sendRow.storyId,
            userId,
            done.sendRow.versionId,
            done.sendRow.sentAt,
          );
        announcePrompterSent(sync(), docId, done.response);
        feed.publish(docId);
        return { ok: true, value: done.response };
      });
    },
    async sendPrevious(userId, request) {
      const preAuth = authorizePrompterRequest(
        storage,
        sync(),
        userId,
        request,
      );
      if (!preAuth.ok) return preAuth;
      const { docId, rowId, key } = request;
      const storageKey = `prev:${key}`;
      return inChain(docId, async () => {
        const auth = authorizePrompterRequest(storage, sync(), userId, request);
        if (!auth.ok) return auth;
        const { home, file } = auth;
        const replayed = replayStoredRequest(file, docId, storageKey, userId);
        if (replayed !== null) return replayed;
        const planned: { step: PreviousStep; sentAt: number }[] = [];
        const committed: PrompterSendResponse[] = [];
        const written = await sync().authorityWrite(docId, {
          userId,
          origin: "system",
          edit(doc) {
            const checked = checkSendableRow(
              storage,
              sync(),
              doc,
              home,
              file,
              userId,
              rowId,
            );
            if (!checked.ok) return checked;
            const { row, storyId } = checked;
            const step = trail.peekPrevious(file, docId, rowId);
            if (step === null) return { ok: false, reason: "cannot_send" };
            if (
              step.target.storyId !== storyId &&
              !sync().access.resolve(userId, step.target.storyId).ok
            )
              return { ok: false, reason: "forbidden" };
            const targetBlocks = readSendBlocks(
              storage,
              home,
              file,
              step.target,
            );
            if (targetBlocks === null)
              return { ok: false, reason: "cannot_send" };
            const headBlocks = readStoryHeadBlocks(
              storage,
              home,
              storyId,
              null,
            );
            const sameAsHead =
              step.target.storyId === storyId &&
              headBlocks !== null &&
              JSON.stringify(slugBlocksOf(headBlocks, row.blockId)) ===
                JSON.stringify(slugBlocksOf(targetBlocks, row.blockId));
            const sentAt = nextSentAt(file, docId, rowId, clock.now());
            planned.push({ step, sentAt });
            writePrompterState(doc, rowId, {
              state: sameAsHead ? "on" : "changed",
              versionId: step.target.versionId,
              sentAt,
              sentByUserId: userId,
            });
            return { ok: true };
          },
          inTransaction(inFile) {
            const [item] = planned;
            if (item === undefined) return;
            const { target } = item.step;
            const sendRow: PrompterSendRow = {
              rundownId: docId,
              rowId,
              storyId: target.storyId,
              versionId: target.versionId,
              generation: target.generation,
              seq: target.seq,
              senderUserId: userId,
              sentAt: item.sentAt,
            };
            committed.push(
              storePrompterSend(inFile, sendRow, { key: storageKey, userId }),
            );
          },
        });
        if (!written.ok)
          return {
            ok: false,
            code:
              written.code === "refused"
                ? mapWriteRefusal(written.reason)
                : "busy",
          };
        const [item] = planned;
        const [response] = committed;
        if (item === undefined || response === undefined)
          return { ok: false, code: "busy" };
        options.cancelAutoSend(docId, rowId);
        trail.commitPrevious(docId, rowId, item.step);
        announcePrompterSent(sync(), docId, response);
        feed.publish(docId);
        return { ok: true, value: response };
      });
    },
    async sendAutomatic(rundownId, rowId, liveStoryDoc) {
      return inChain(rundownId, async () => {
        if (storage.directory.tombstoneOf(rundownId) !== null) return "skipped";
        const place = storage.directory.placeOf(rundownId);
        if (place === null || place.kind !== "rundown") return "skipped";
        if (airWindows.isInside(rundownId, clock.now())) return "inside_window";
        const file = storage.open(place.home);
        const planned: { storyId: string; sentAt: number }[] = [];
        const committed: CommittedSend[] = [];
        const written = await sync().authorityWrite(rundownId, {
          userId: SYSTEM_USER_ID,
          origin: "system",
          edit(doc) {
            if (airWindows.isInside(rundownId, clock.now()))
              return { ok: false, reason: "inside_window" };
            const row = readRundown(doc).rows.find((r) => r.id === rowId);
            if (
              row === undefined ||
              row.kind !== "script" ||
              row.docId === null
            )
              return { ok: false, reason: "skipped" };
            const headBlocks = readStoryHeadBlocks(
              storage,
              place.home,
              row.docId,
              liveStoryDoc,
            );
            if (
              headBlocks === null ||
              !isRowChanged(
                storage,
                place.home,
                file,
                rundownId,
                row,
                headBlocks,
              )
            )
              return { ok: false, reason: "skipped" };
            const sentAt = nextSentAt(file, rundownId, rowId, clock.now());
            planned.push({ storyId: row.docId, sentAt });
            writePrompterState(doc, rowId, {
              state: "on",
              versionId: null,
              sentAt,
              sentByUserId: null,
            });
            return { ok: true };
          },
          inTransaction(inFile) {
            const [item] = planned;
            if (item === undefined) return;
            const { storyId, sentAt } = item;
            const storyRow = inFile.log.get(storyId);
            if (storyRow === null) return;
            const sendRow: PrompterSendRow = {
              rundownId,
              rowId,
              storyId,
              versionId: null,
              generation: storyRow.generation,
              seq: storyRow.headSeq,
              senderUserId: null,
              sentAt,
            };
            inFile.prompter.record(sendRow);
            committed.push({
              sendRow,
              response: {
                rowId,
                storyId,
                versionId: null,
                sentAt,
                senderUserId: null,
              },
            });
          },
        });
        if (!written.ok) {
          if (written.code === "refused" && written.reason === "inside_window")
            return "inside_window";
          return written.code === "refused" ? "skipped" : "retry";
        }
        const [done] = committed;
        if (done === undefined) return "skipped";
        trail.record(rundownId, rowId, done.sendRow);
        announcePrompterSent(sync(), rundownId, done.response);
        feed.publish(rundownId);
        return "sent";
      });
    },
    dropRow(rundownId, rowId) {
      trail.drop(rundownId, rowId);
    },
  };
}
