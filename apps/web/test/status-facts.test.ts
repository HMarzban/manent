import { expect, test } from "bun:test";
import type {
  DocStatus,
  LinkFacts,
  LinkIssue,
  LinkState,
  SideState,
} from "@manent/sync-client";
import { statusText } from "@manent/ui";
import type { StatusWords } from "@manent/ui";
import fc from "fast-check";
import { toStatusFacts } from "../src/services/sync/status-facts.ts";
import type { StatusInput } from "../src/services/sync/status-facts.ts";

const DAY = 86_400_000;
const TUE_14_10 = new Date(2026, 10, 10, 14, 10).getTime();

const S: DocStatus = {
  saved: true,
  synced: true,
  waiting: 0,
  link: "online",
  docSync: "synced",
  wentOfflineAt: null,
  neverSynced: false,
  recovered: 0,
  side: [],
};
const ONLINE_LINK: LinkFacts = {
  state: "online",
  issue: "none",
  server: null,
  wentOfflineAt: null,
  leader: true,
};
const OFFLINE_LINK: LinkFacts = {
  ...ONLINE_LINK,
  state: "offline",
  wentOfflineAt: TUE_14_10,
};
const SYNCED_INPUT: StatusInput = {
  status: S,
  link: ONLINE_LINK,
  network: true,
  viewRole: null,
  viewLive: false,
  offlineSinceAt: null,
  toReview: 0,
  signedIn: false,
  now: TUE_14_10,
};

/** The two slots as the status reads them aloud: one sentence when it spans both. */
const sentence = (words: StatusWords): string =>
  words.spans || words.device === null
    ? words.server
    : `${words.device} · ${words.server}`;

const said = (input: Partial<StatusInput>): string =>
  sentence(statusText(toStatusFacts({ ...SYNCED_INPUT, ...input })));

test("each fact of the sync client says its sentence", () => {
  expect(said({})).toBe("Saved · Synced");
  expect(
    said({ status: { ...S, docSync: "syncing", synced: false, waiting: 3 } }),
  ).toBe("Saved · Syncing…");
  expect(
    said({
      network: false,
      link: OFFLINE_LINK,
      status: { ...S, docSync: "local", waiting: 12 },
    }),
  ).toBe("Saved · Offline, 12 waiting");
  expect(
    said({
      network: false,
      link: OFFLINE_LINK,
      offlineSinceAt: TUE_14_10,
      now: TUE_14_10 + 2 * DAY,
      status: { ...S, docSync: "local", waiting: 212 },
    }),
  ).toBe("Saved · Offline since Tue 14:10, 212 waiting");
  expect(
    said({
      network: true,
      link: OFFLINE_LINK,
      status: { ...S, docSync: "local", waiting: 12 },
    }),
  ).toBe("Saved · Can't reach Manent, 12 waiting");
  expect(
    said({
      link: { ...OFFLINE_LINK, issue: "sign_in" },
      status: { ...S, docSync: "local", waiting: 12 },
    }),
  ).toBe("Saved · Sign in to sync, 12 waiting");
  expect(said({ status: { ...S, side: ["access_removed"], waiting: 5 } })).toBe(
    "Saved · Access removed, 5 not sent",
  );
  expect(said({ status: { ...S, side: ["deleted"], waiting: 5 } })).toBe(
    "Saved · Deleted, 5 not sent",
  );
  expect(
    said({
      link: { ...ONLINE_LINK, issue: "server_old" },
      status: { ...S, docSync: "local", waiting: 12 },
    }),
  ).toBe("Saved · Server out of date, 12 waiting");
  expect(
    said({
      status: { ...S, side: ["server_old"], docSync: "local", waiting: 0 },
    }),
  ).toBe("Saved · Server out of date");
  expect(
    said({
      link: { ...ONLINE_LINK, issue: "too_old" },
      status: { ...S, docSync: "local", waiting: 12 },
    }),
  ).toBe("Saved · Update Manent to sync, 12 waiting");
  expect(
    said({
      link: { ...ONLINE_LINK, issue: "too_old" },
      status: { ...S, docSync: "local", waiting: 0 },
    }),
  ).toBe("Saved · Update Manent to sync");
  expect(
    said({
      status: { ...S, neverSynced: true, docSync: "local" },
      link: { ...OFFLINE_LINK, issue: "sign_in" },
    }),
  ).toBe("Saved · Only in this browser — not backed up");
  expect(
    said({
      status: { ...S, neverSynced: true, docSync: "local" },
      link: { ...OFFLINE_LINK, issue: "sign_in" },
      shell: "desktop",
      signedIn: true,
    }),
  ).toBe("Saved · On this device only");
  expect(said({ toReview: 2 })).toBe("Saved · Synced, 2 to review");
  expect(
    said({ status: { ...S, side: ["view_only"] }, viewRole: "view" }),
  ).toBe("View only");
  // a commenter keeps both slots
  expect(
    said({
      status: { ...S, side: ["view_only"], docSync: "local" },
      viewRole: "comment",
      viewLive: true,
    }),
  ).toBe("Saved · Synced");
  expect(said({ status: { ...S, side: ["read_only"] } })).toBe(
    "Read-only — update Manent to edit",
  );
  expect(said({ status: { ...S, saved: false, side: ["not_saved"] } })).toBe(
    "Not saved on this device · Synced",
  );
  expect(
    said({
      network: false,
      link: OFFLINE_LINK,
      status: { ...S, saved: false, side: ["not_saved"], docSync: "local" },
    }),
  ).toBe("Can't save on this device — export a copy");
});

const LINK_STATES: readonly LinkState[] = [
  "offline",
  "connecting",
  "authenticating",
  "online",
];
const LINK_ISSUES: readonly LinkIssue[] = [
  "none",
  "sign_in",
  "too_old",
  "server_old",
];
const SIDE_STATES: readonly SideState[] = [
  "access_removed",
  "deleted",
  "read_only",
  "rejected",
  "not_saved",
  "sign_in",
  "server_old",
  "view_only",
];
const DOC_SYNCS: readonly DocStatus["docSync"][] = [
  "local",
  "syncing",
  "synced",
];

// small pools of every value the facts read; `synced` follows docSync, as the client derives it
const arbStatusInput: fc.Arbitrary<StatusInput> = fc
  .record({
    state: fc.constantFrom(...LINK_STATES),
    issue: fc.constantFrom(...LINK_ISSUES),
    side: fc.subarray([...SIDE_STATES]),
    docSync: fc.constantFrom(...DOC_SYNCS),
    waiting: fc.constantFrom(0, 1, 1212),
    network: fc.boolean(),
    neverSynced: fc.boolean(),
  })
  .map(({ state, issue, side, docSync, waiting, network, neverSynced }) => ({
    ...SYNCED_INPUT,
    network,
    link: { ...ONLINE_LINK, state, issue },
    status: {
      ...S,
      link: state,
      docSync,
      synced: docSync === "synced",
      waiting,
      neverSynced,
      side,
    },
  }));

test("Synced is never said while anything is waiting", () => {
  fc.assert(
    fc.property(arbStatusInput, (input) => {
      const w = statusText(toStatusFacts(input));
      if (input.status.waiting > 0 || !input.status.synced)
        expect(w.server).not.toMatch(new RegExp("^Synced"));
    }),
    { numRuns: 1000 },
  );
});
