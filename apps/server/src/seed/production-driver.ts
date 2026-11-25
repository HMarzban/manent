// The seed driver's production requests: lock, issue and recall through the server's routes.
import { revisedOverrides, scriptBody } from "@manent/crdt";
import { SeedDriverError, createSeedTime } from "@manent/demo";
import type { SeedProduction } from "@manent/demo";
import { contentHash, overrideKey } from "@manent/revisions";
import { isProductionState } from "@manent/sync-protocol";
import type { Driving } from "./driving.ts";
import { isFields } from "./link.ts";
import { revisedPagesOf } from "./page-meter.ts";

/** The local calendar day of `at`, in this machine's zone at that moment. */
const localDay = (at: number): string =>
  createSeedTime({
    seedAt: at,
    zoneOffsetMs: -new Date(at).getTimezoneOffset() * 60_000,
  }).day(at);

/** What an issue and a correction send besides their pages: the marked PDF, no tint. */
const SENT = Object.freeze({ files: ["pdf_marked"], tint: false });

/** The production routes; a request that changes something reads the state first, for the active set. */
export function createProduction(d: Driving): SeedProduction {
  const post = (userId: string, path: string, body: object) =>
    d.call(userId, { method: "POST", path: `/api/production/${path}`, body });
  const state = async (userId: string, docId: string) => {
    const answer = await post(userId, "state", { docId });
    if (!isProductionState(answer))
      throw new SeedDriverError("unavailable", `${docId} has no state`);
    return answer;
  };
  const today = () => localDay(d.target.clock.now());
  return {
    state,
    async lock(userId, docId) {
      const lockedOn = today();
      const body = { docId, key: d.key(), numbering: "suffix", lockedOn };
      await post(userId, "lock", { ...body, colourOrder: "standard" });
    },
    async issue(userId, docId, memo) {
      // the revision being worked on is the last of the script's sets
      const active = (await state(userId, docId)).sets.at(-1);
      if (active === undefined)
        throw new SeedDriverError("refused", `${docId} is not locked`);
      const request = { docId, key: d.key(), expectedOrdinal: active.ordinal };
      const answer = await post(userId, "issue", {
        ...request,
        ...SENT,
        what: "changed",
        pages: revisedPagesOf(d.target.storage, docId),
        recipientUserIds: d.target.storage.directory
          .rolesOf(docId)
          .flatMap((role) => (role.userId === userId ? [] : [role.userId])),
        memo,
        issuedOn: today(),
      });
      const issue = isFields(answer) ? answer.issue : null;
      const after = isFields(answer) ? answer.state : null;
      const setId = isFields(issue) ? issue.setId : null;
      const set = isProductionState(after)
        ? after.sets.find((s) => s.setId === setId)
        : undefined;
      if (set === undefined)
        throw new SeedDriverError("unavailable", `${docId}'s issue has no set`);
      return { colour: set.colour };
    },
    async recall(userId, docId, pages, memo) {
      const issued = (await state(userId, docId)).sets.findLast(
        (s) => s.issuedAt !== null,
      );
      if (issued === undefined)
        throw new SeedDriverError("refused", `${docId} has issued nothing`);
      const { setId } = issued;
      const body = { docId, key: d.key(), setId, pages, memo, ...SENT };
      await post(userId, "recall", { ...body, issuedOn: today() });
    },
    async setOverride(session, setId, blockId, value) {
      await session.change((doc) => {
        const sections = scriptBody(doc).materialize().content ?? [];
        const block = sections
          .flatMap((section) => section.content ?? [])
          .find((b) => b.attrs?.id === blockId);
        if (block === undefined)
          throw new RangeError(`the script holds no block ${blockId}`);
        const stored =
          value === "marked" ? "marked" : `cleared@${contentHash(block)}`;
        revisedOverrides(doc).set(overrideKey(setId, blockId), stored, null);
      });
    },
    revisedPages: async (docId) => revisedPagesOf(d.target.storage, docId),
  };
}
