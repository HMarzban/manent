// The trade-offs the app makes, in the words written for publication, and the result rows that
// bear on each.

import { bearingRows, ref } from "./breaks.ts";
import type { RowRef } from "./breaks.ts";
import { NOT_MEASURED, table } from "./format.ts";
import type { Run } from "./format.ts";
import { NO_BEARING } from "./text.ts";

export interface TradeOff {
  number: number;
  tradeOff: string;
  /** What we gain. */
  gain: string;
  /** What we give up, and where the limit is. */
  cost: string;
}

export const TRADE_OFFS: readonly TradeOff[] = Object.freeze([
  {
    number: 1,
    tradeOff: "CRDT instead of a central authority",
    gain: "Offline edits of any age merge without dropping steps",
    cost: "For an online-only product an authority model is simpler and would be the better pick. A CRDT server cannot cheaply tell what an accepted update _means_: scene assignment, who may accept a suggestion and the ban on suggesting after lock are enforced in the interface only. Everything that must be exact — versions, locks, issues, numbers — is therefore sequenced by the cloud, not merged",
  },
  {
    number: 2,
    tradeOff: "Rebuilding a document when it is over budget",
    gain: "Typing cost and size stay flat however long a show runs",
    cost: "Every rebuild turns later offline arrivals from a character-level merge into a block-level replay and resets undo. After 90 days an arrival is a side-by-side manual merge, which is the kind of recovery we criticise in others. So rebuilds are rare, never scheduled, and never inside an air window",
  },
  {
    number: 3,
    tradeOff: "Invisible sections with `content-visibility`",
    gain: "A keystroke at 1,000 pages cost 1.4 ms instead of 17.8 ms in a bare-ProseMirror spike",
    cost: "More editor complexity at every section boundary, and a browser feature with a recorded caret bug in editable content. Nothing is measured at 2,000 pages, with the real engine, or with Yjs attached. The fallback costs about five times more per keystroke and brings a lower, measured comfort limit",
  },
  {
    number: 4,
    tradeOff: "Arithmetic pagination",
    gain: "Every collaborator and the PDF agree on every page, with no measuring and no feedback loop",
    cost: "No page-for-page parity with other screenwriting tools, whose Courier faces are not exactly 10 characters per inch. Parity is promised only for characters in the script font; wide, right-to-left and complex scripts are kept but not typeset or printed correctly. On Firefox and Safari wrap mismatches are tracked and corrected on screen, not blocked",
  },
  {
    number: 5,
    tradeOff: "History outside the live document",
    gain: "The live document stays small no matter how many versions and revisions exist",
    cost: "Authorship is per character only in the log since the newest checkpoint; before that, and once a log is dropped, it is per block, per version. History between two syncs is the device's snapshots (at most hourly), not keystroke by keystroke as the device saw it",
  },
  {
    number: 6,
    tradeOff: "Browser storage for offline work on the web",
    gain: "The web app works offline with nothing installed",
    cost: 'A browser can clear it; Safari does so after a period without use. A script that exists "only in this browser" says so. Persistent storage is requested on the first change of a session, except in Firefox, where the request asks the person a question and is made only from Preferences. When a browser clears everything, its device identity goes too, so what existed only there cannot be named afterwards. The desktop app is the durable offline client',
  },
  {
    number: 7,
    tradeOff: "One server process",
    gain: "One thing to deploy, back up and reason about; exact ordering for free",
    cost: "A crash or a deploy stops sync and prompter updates for every project until it restarts, and making versions and issuing run on the same machine as serving (trade-off 20). Clients keep working offline through it. More than one writer host needs the Postgres driver",
  },
  {
    number: 8,
    tradeOff: "Electrobun",
    gain: "The desktop app's main process is Bun; one runtime",
    cost: "A young project with a small team behind it, three months into 2.0; file associations on macOS only; unmeasured with bundled Chromium. Builds are unsigned, so users see a warning at first open, and updates come from public releases",
  },
  {
    number: 9,
    tradeOff: "Installer size",
    gain: "A self-contained app with identical rendering on three systems",
    cost: "The compiled server alone is 85–110 MB per target; the desktop app adds Chromium on top. The benchmark reports the real installer size against a budget",
  },
  {
    number: 10,
    tradeOff: "Full scope in one release",
    gain: "Nothing the owner asked for is designed out",
    cost: "Risk concentrates. The build order puts the core first and every step ships only with its tests; what is finished runs and can be shown, and the stages after the core — working with other people, variety and news, admin and the remaining formats — follow in that order. The report says which stages were reached",
  },
  {
    number: 11,
    tradeOff: "Derived revision marks",
    gain: "No stale marks; identical on every client",
    cost: "A retyped or copied block has a new ID and is marked whole",
  },
  {
    number: 12,
    tradeOff:
      "One Writing switch, comments in rounds, History as a tab, one Send screen",
    gain: "Fewer things to learn: five kinds of surface and one word per thing",
    cost: "A private draft and formal feedback are not things of their own in the interface. An executive's note looks like any comment until the round's name is read. An old version is shown in the page's place, so the state bar's sentence must be unmistakable. Issue looks less special than it did",
  },
  {
    number: 13,
    tradeOff: "Nine preferences, no key sets, no preferences file",
    gain: "Defaults carry almost everyone, and nothing personal can move a page",
    cost: "No second page font and no in-app reduce-motion. Theme cannot differ per device except through System. A writer cannot adopt another tool's keys in one step. Two changes to one preference are ordered by device clocks, and a reset is final after 30 seconds",
  },
  {
    number: 14,
    tradeOff:
      "A dark sheet in the dark theme; the band in place of the tint; stock components unedited",
    gain: "Less light at night; a revision can be told in both themes; one class list per component",
    cost: "A dark sheet has less contrast headroom than white paper (the worst stacked case is 4.59:1 against 4.71:1). A paper's colour shows on 8 px, not the whole page, unless the tint is switched on. `dark:` classes cannot be used at all. There is one density. High contrast cannot be tried on part of a screen",
  },
  {
    number: 15,
    tradeOff:
      "Healing a restored server from clients, bounded by what it had acknowledged",
    gain: "A restored backup loses nothing a client still holds, and no client can inject another person's unacknowledged text",
    cost: "Text beyond the restored acknowledgement record comes back as the edits of whoever held it, so after a restore some words can carry the wrong author",
  },
  {
    number: 16,
    tradeOff: "Sections never move an existing block",
    gain: "A merge can never lose an edit to a container move",
    cost: "Dual dialogue that straddles a section boundary is drawn stacked on screen while the PDF keeps the columns; on that page the screen differs from the PDF. A rebuild keeps every dual run inside one section",
  },
  {
    number: 17,
    tradeOff: "Removed text drawn on the page in Changes since",
    gain: "A writer reads what went where it was",
    cost: "While changes are shown on the page, lines carrying removed text run past the engine's page and are not corrected; Side by side and As it was keep exact pages",
  },
  {
    number: 18,
    tradeOff: "Overlap detection while online",
    gain: "Two people changing one speech within 3 seconds are both told",
    cost: "It is approximate: \"theirs\" is the block without this device's recent typing, so a deletion this device made of the other person's text in that window cannot be undone from the review",
  },
  {
    number: 19,
    tradeOff: "The log is kept until a rebuild",
    gain: "Every acknowledged edit stays in an append-only, checksummed log: exact versions and recovery",
    cost: "Storage grows with every keystroke, about 0.8 MB per typist-hour, until a rebuild replaces it",
  },
  {
    number: 20,
    tradeOff: "Heavy work on the serving thread",
    gain: "One process, no worker protocol for the rarer jobs",
    cost: "A rebuild of a 2,000-page script, a replay whose base is rebuilt from a long log, making a version of a long script, and drawing an issued PDF run inline and can stall other documents; each moves to the checkpoint worker if the benchmark shows a stall over 20 ms",
  },
  {
    number: 21,
    tradeOff: "Two durable writes per keystroke on desktop",
    gain: '"Saved" means the device\'s own store, whatever the cloud does',
    cost: "Every keystroke is written twice, to the node's log and to the upstream outbox, on the same disk; a setting change is acknowledged before the upstream outbox holds it, so a crash in that gap can lose a setting change, never text",
  },
  {
    number: 22,
    tradeOff: "Cursors sent as block and offset with a position hint",
    gain: "No CRDT internals in presence; cursors survive a rebuild",
    cost: "A cursor whose block is more than 200 blocks from its hint is hidden until it moves",
  },
  {
    number: 23,
    tradeOff: "A revision's date from the issuing device",
    gain: "A server in another time zone cannot change a header",
    cost: "A device with a wrong calendar stamps a wrong date",
  },
  {
    number: 24,
    tradeOff: "Seeding the demo through the real write path",
    gain: "The demo's history, versions and revisions are what the product would have made",
    cost: "The large workspace takes minutes to seed, in the background",
  },
  {
    number: 25,
    tradeOff: "One comfort limit for every device",
    gain: "A notice that is honest about long scripts from the first release",
    cost: "The figure is measured on one reference machine; a slower device slows down before it is told, a faster one is told early",
  },
  {
    number: 26,
    tradeOff:
      "Cursor colours given by the server, in the order people first open a script for editing",
    gain: "The first ten people on a script never share a colour, and a colour never changes",
    cost: "Someone who opened the script for editing and never typed still holds a colour; the eleventh person shares the first one's colour and is told apart by the name tab",
  },
  {
    number: 27,
    tradeOff:
      "The PDF is written in the page, from the pagination already on screen",
    gain: "Export and Print work offline, with no server, and the file's pages are the screen's",
    cost: "Writing a very long script's PDF occupies the window while the Send screen shows its busy state; at 2,000 pages that can take seconds",
  },
  {
    number: 28,
    tradeOff:
      "An issued revision's file is drawn again from what was issued each time it is asked for",
    gain: "Nothing extra is stored, and the file always matches the issued version",
    cost: "Its pages, lines and marks never change; its bytes may differ between releases of the PDF library, because they are not stored",
  },
]);

const ENVELOPE: RowRef = { type: "part", name: "the comfort envelope" };

/** The rows that bear on a trade-off, by its number; a trade-off not named here has none. */
export const BEARS_ON: ReadonlyMap<number, readonly RowRef[]> = new Map([
  [1, [ref("merge-offline-120"), ref("merge-offline-book-2000")]],
  [2, [ref("crdt.rebuild-size"), ref("crdt.aged")]],
  [
    3,
    [
      ...[30, 120, 300, 1000, 2000].map((p) => ref(`typing-${p}`)),
      ref("typing-flat-1000"),
      ENVELOPE,
    ],
  ],
  [5, [ref("history.list.first_page"), ref("history.compare.120")]],
  [7, [ref("server.fanout"), ref("server.join-storm")]],
  [9, [{ type: "part", name: "the desktop installer size" }]],
  [19, [ref("server.persistence", "growth_bytes_per_typist_hour")]],
  [20, [ref("server.rebuild-stall"), ref("history.version.2000")]],
  [21, [ref("desktop.saved-fsync")]],
  [22, [ref("server.presence")]],
  [24, [ref("demo.seed")]],
  [25, [ENVELOPE]],
  [27, [ref("export.pdf-120")]],
]);

export function tradeOffsSection(runs: readonly Run[]): string {
  return table(
    [
      "#",
      "Trade-off",
      "What we gain",
      "What we give up, and where the limit is",
      "Rows that bear on it",
    ],
    TRADE_OFFS.map((t) => {
      const refs = BEARS_ON.get(t.number);
      const rows =
        refs === undefined
          ? NO_BEARING
          : (bearingRows(runs, refs) ?? NOT_MEASURED);
      return [String(t.number), t.tradeOff, t.gain, t.cost, rows];
    }),
  );
}
