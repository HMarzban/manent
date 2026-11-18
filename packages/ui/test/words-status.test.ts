import { expect, test } from "bun:test";
import { brotliDecompressSync } from "node:zlib";
import {
  formatCount,
  formatDate,
  formatDay,
  formatTime,
  formatWhen,
  joinNames,
  statusText,
  SYNCED_AFTER_MS,
} from "../src/index.ts";
import type { StatusFacts } from "../src/index.ts";

const TUE_17_NOV_15_00 = new Date(2026, 10, 17, 15, 0).getTime();
const MON_16_NOV_10_00 = new Date(2026, 10, 16, 10, 0).getTime();
const FRI_13_NOV_14_10 = new Date(2026, 10, 13, 14, 10).getTime();
const WED_11_NOV_23_58 = new Date(2026, 10, 11, 23, 58).getTime();
const TUE_3_NOV_09_00 = new Date(2026, 10, 3, 9, 0).getTime();
const NOW = TUE_17_NOV_15_00;
const HOUR_MS = 3_600_000;

const facts = (f: Partial<StatusFacts>): StatusFacts => ({
  access: "edit",
  device: "ok",
  network: "online",
  server: "synced",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: false,
  shell: "web",
  toReview: 0,
  now: TUE_17_NOV_15_00,
  ...f,
});
const said = (f: Partial<StatusFacts>) => {
  const w = statusText(facts(f));
  return w.spans ? w.server : `${w.device} · ${w.server}`;
};

const tone = (f: Partial<StatusFacts>) => statusText(facts(f)).tone;

test("the status says where the words are, in the design's words", () => {
  expect(said({})).toBe("Saved · Synced");
  expect(said({ server: "syncing" })).toBe("Saved · Syncing…");
  expect(said({ network: "offline" })).toBe("Saved · Offline");
  expect(said({ network: "offline", waiting: 12 })).toBe(
    "Saved · Offline, 12 waiting",
  );
  expect(
    said({
      network: "offline",
      waiting: 212,
      offlineSinceAt: FRI_13_NOV_14_10,
    }),
  ).toBe("Saved · Offline since Fri 14:10, 212 waiting");
  expect(said({ server: "unreachable", waiting: 12 })).toBe(
    "Saved · Can't reach Manent, 12 waiting",
  );
  expect(said({ server: "sign_in", waiting: 12 })).toBe(
    "Saved · Sign in to sync, 12 waiting",
  );
  expect(said({ server: "access_removed", notSent: 5 })).toBe(
    "Saved · Access removed, 5 not sent",
  );
  expect(said({ neverSynced: true, shell: "desktop" })).toBe(
    "Saved · On this device only",
  );
  expect(said({ neverSynced: true })).toBe(
    "Saved · Only in this browser — not backed up",
  );
  expect(said({ toReview: 2 })).toBe("Saved · Synced, 2 to review");
  expect(said({ access: "view" })).toBe("View only");
  expect(said({ access: "too_old" })).toBe("Read-only — update Manent to edit");
  expect(said({ device: "failing" })).toBe("Not saved on this device · Synced");
  expect(said({ device: "failing", network: "offline" })).toBe(
    "Can't save on this device — export a copy",
  );
  expect(said({ server: "server_old", waiting: 12 })).toBe(
    "Saved · Server out of date, 12 waiting",
  );
  expect([
    said({ server: "app_old", waiting: 12 }),
    said({ server: "app_old" }),
  ]).toEqual([
    "Saved · Update Manent to sync, 12 waiting",
    "Saved · Update Manent to sync",
  ]);
  expect(said({ server: "deleted", notSent: 5 })).toBe(
    "Saved · Deleted, 5 not sent",
  );
  expect(
    said({
      network: "offline",
      waiting: 212,
      offlineSinceAt: TUE_3_NOV_09_00,
    }),
  ).toBe("Saved · Offline since 3 Nov, 212 waiting");
});

test("a count of 0 is left out with its comma", () => {
  expect([
    said({ server: "sign_in" }),
    said({ server: "unreachable" }),
    said({ server: "access_removed" }),
    said({ server: "server_old" }),
    said({ network: "offline", offlineSinceAt: FRI_13_NOV_14_10 }),
  ]).toEqual([
    "Saved · Sign in to sync",
    "Saved · Can't reach Manent",
    "Saved · Access removed",
    "Saved · Server out of date",
    "Saved · Offline since Fri 14:10",
  ]);
});

test("precedence: device storage, access removed or deleted, sign-in, unreachable or out of date, offline", () => {
  const all: Partial<StatusFacts> = {
    device: "failing",
    server: "access_removed",
    notSent: 5,
    waiting: 3,
  };
  expect([
    said(all),
    said({ ...all, device: "ok" }),
    said({ ...all, device: "ok", server: "deleted" }),
    said({ ...all, device: "ok", server: "sign_in" }),
    said({ ...all, device: "ok", server: "unreachable" }),
    said({ ...all, device: "ok", server: "server_old" }),
    said({ ...all, device: "ok", server: "app_old" }),
    said({ ...all, device: "ok", server: "unreachable", network: "offline" }),
  ]).toEqual([
    "Not saved on this device · Access removed, 5 not sent",
    "Saved · Access removed, 5 not sent",
    "Saved · Deleted, 5 not sent",
    "Saved · Sign in to sync, 3 waiting",
    "Saved · Can't reach Manent, 3 waiting",
    "Saved · Server out of date, 3 waiting",
    "Saved · Update Manent to sync, 3 waiting",
    "Saved · Offline, 3 waiting",
  ]);
});

test("an expired sign-in on an offline device shows the offline text", () => {
  expect(said({ server: "sign_in", network: "offline", waiting: 3 })).toBe(
    "Saved · Offline, 3 waiting",
  );
});

test("offline for a day reads its day and time, and after six days its date", () => {
  expect([
    said({ network: "offline", offlineSinceAt: NOW - 23 * HOUR_MS }),
    said({ network: "offline", offlineSinceAt: NOW - 25 * HOUR_MS }),
    said({ network: "offline", offlineSinceAt: NOW - 6 * 24 * HOUR_MS }),
    said({ network: "offline", offlineSinceAt: NOW - 7 * 24 * HOUR_MS }),
  ]).toEqual([
    "Saved · Offline",
    "Saved · Offline since Mon 14:00",
    "Saved · Offline since Wed 15:00",
    "Saved · Offline since 10 Nov",
  ]);
});

test("the calm state is the quiet one, and only the device alert is an alert", () => {
  expect([
    tone({}),
    tone({ server: "syncing" }),
    tone({ network: "offline", waiting: 12 }),
    tone({ server: "unreachable" }),
    tone({ server: "sign_in" }),
    tone({ neverSynced: true }),
    tone({ access: "view" }),
    tone({ access: "too_old" }),
    tone({ toReview: 2 }),
    tone({ server: "access_removed" }),
    tone({ server: "deleted" }),
    tone({ device: "failing" }),
    tone({ device: "failing", network: "offline" }),
  ]).toEqual([
    "quiet",
    "normal",
    "normal",
    "normal",
    "normal",
    "normal",
    "normal",
    "normal",
    "attention",
    "attention",
    "attention",
    "alert",
    "alert",
  ]);
});

test("the three single-sentence states span both slots and leave the device slot empty", () => {
  const spanning = [
    facts({ access: "view" }),
    facts({ access: "too_old" }),
    facts({ device: "failing", network: "offline" }),
  ].map((f) => {
    const w = statusText(f);
    return [w.device, w.spans];
  });
  expect(spanning).toEqual([
    [null, true],
    [null, true],
    [null, true],
  ]);
  expect(statusText(facts({ device: "failing" }))).toEqual({
    device: "Not saved on this device",
    server: "Synced",
    tone: "alert",
    spans: false,
  });
});

test("Synced waits two seconds after the last change is acknowledged", () => {
  expect(SYNCED_AFTER_MS).toBe(2000);
});

/** Advance widths of the bundled Inter Variable face, read from its WOFF2 file: the cmap (format 4) and hmtx tables, no kerning. */
function readAdvances(file: Uint8Array): {
  unitsPerEm: number;
  advance(codePoint: number): number;
} {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const tableCount = view.getUint16(12);
  const KNOWN_TAGS: Record<number, string> = {
    0: "cmap",
    1: "head",
    2: "hhea",
    3: "hmtx",
    10: "glyf",
    11: "loca",
  };
  let p = 48;
  const base128 = () => {
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const b = file[p++] ?? 0;
      n = n * 128 + (b & 127);
      if ((b & 128) === 0) return n;
    }
    throw new RangeError("a WOFF2 number is longer than five bytes");
  };
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < tableCount; i++) {
    const flags = file[p++] ?? 0;
    let tag = KNOWN_TAGS[flags & 63] ?? `#${flags & 63}`;
    if ((flags & 63) === 63) {
      tag = String.fromCharCode(...file.subarray(p, p + 4));
      p += 4;
    }
    const version = flags >> 6;
    let length = base128();
    const transformed =
      tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    if (transformed) length = base128();
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(file.subarray(p, p + view.getUint32(20)));
  const table: Record<string, DataView> = {};
  let offset = 0;
  for (const { tag, length } of tables) {
    table[tag] = new DataView(data.buffer, data.byteOffset + offset, length);
    offset += length;
  }
  const { cmap, head, hhea, hmtx } = table;
  if (!cmap || !head || !hhea || !hmtx)
    throw new TypeError("the font lacks a cmap, head, hhea or hmtx table");
  const metrics = hhea.getUint16(34);
  const glyphs = new Map<number, number>();
  for (let i = 0; i < cmap.getUint16(2); i++) {
    const at = cmap.getUint32(4 + i * 8 + 4);
    if (cmap.getUint16(at) !== 4) continue;
    const segments = cmap.getUint16(at + 6) / 2;
    const ends = at + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let s = 0; s < segments; s++) {
      const start = cmap.getUint16(starts + s * 2);
      const end = cmap.getUint16(ends + s * 2);
      const delta = cmap.getInt16(deltas + s * 2);
      const range = cmap.getUint16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        const index =
          range === 0
            ? c
            : cmap.getUint16(ranges + s * 2 + range + (c - start) * 2);
        if (range === 0 || index !== 0) glyphs.set(c, (index + delta) & 0xffff);
      }
    }
  }
  return {
    unitsPerEm: head.getUint16(18),
    advance: (codePoint) => {
      const glyph = glyphs.get(codePoint);
      if (glyph === undefined)
        throw new RangeError(
          `the face has no glyph for U+${codePoint.toString(16)}`,
        );
      return hmtx.getUint16(4 * Math.min(glyph, metrics - 1));
    },
  };
}

const INTER_FILE = Bun.resolveSync(
  "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  import.meta.dir,
);
const INTER_13PX = {
  face: readAdvances(await Bun.file(INTER_FILE).bytes()),
  px: 13,
};

const textWidthPx = (text: string, font: typeof INTER_13PX): number =>
  ([...text].reduce(
    (sum, ch) => sum + font.face.advance(ch.codePointAt(0) ?? 0),
    0,
  ) *
    font.px) /
  font.face.unitsPerEm;

// Every row of the status table with a four-digit count, on a 13 px interface face.
const ALL_ROWS_WITH_COUNT_1212: readonly StatusFacts[] = [
  facts({}),
  facts({ server: "syncing" }),
  facts({ network: "offline" }),
  facts({ network: "offline", waiting: 1212 }),
  facts({
    network: "offline",
    waiting: 1212,
    offlineSinceAt: FRI_13_NOV_14_10,
  }),
  facts({
    network: "offline",
    waiting: 1212,
    offlineSinceAt: WED_11_NOV_23_58,
  }),
  facts({ network: "offline", waiting: 1212, offlineSinceAt: TUE_3_NOV_09_00 }),
  facts({ server: "unreachable", waiting: 1212 }),
  facts({ server: "server_old", waiting: 1212 }),
  facts({ server: "app_old", waiting: 1212 }),
  facts({ server: "sign_in", waiting: 1212 }),
  facts({ server: "access_removed", notSent: 1212 }),
  facts({ server: "deleted", notSent: 1212 }),
  facts({ neverSynced: true, shell: "desktop" }),
  facts({ neverSynced: true }),
  facts({ toReview: 1212 }),
  facts({ access: "view" }),
  facts({ access: "too_old" }),
  facts({ device: "failing" }),
  facts({ device: "failing", network: "offline" }),
];

test("every status sentence fits its slot with a four-digit count", () => {
  // The slot is --status-server-w, 280 px at Interface size 100 %.
  for (const f of ALL_ROWS_WITH_COUNT_1212)
    expect(textWidthPx(statusText(f).server, INTER_13PX)).toBeLessThanOrEqual(
      280,
    );
});

test("the width reader measures the face, not a fixed advance", () => {
  expect([
    textWidthPx("Saved", INTER_13PX).toFixed(1),
    textWidthPx(
      "Can't save on this device — export a copy",
      INTER_13PX,
    ).toFixed(1),
  ]).toEqual(["38.5", "259.7"]);
});

test("names and counts read in words", () => {
  expect([
    joinNames(["Dana"]),
    joinNames(["Dana", "Sam"]),
    joinNames(["Dana", "Sam", "Priya"]),
  ]).toEqual(["Dana", "Dana and Sam", "Dana, Sam and Priya"]);
  expect([
    formatCount(1212),
    formatWhen(NOW - 14 * 60_000, NOW),
    formatWhen(NOW - 3_600_000, NOW),
    formatWhen(MON_16_NOV_10_00, NOW),
  ]).toEqual(["1,212", "14 min ago", "1 hr ago", "Mon"]);
});

test("a time reads relatively in the Last edited column", () => {
  expect([
    formatWhen(NOW - 59_000, NOW),
    formatWhen(NOW - 60_000, NOW),
    formatWhen(NOW - 23 * HOUR_MS, NOW),
    formatWhen(NOW - 6 * 24 * HOUR_MS, NOW),
    formatWhen(NOW - 7 * 24 * HOUR_MS, NOW),
  ]).toEqual(["just now", "1 min ago", "23 hr ago", "Wed", "10 Nov"]);
});

test("a day, a date and a time read as the interface writes them", () => {
  expect([
    formatDay(FRI_13_NOV_14_10),
    formatDate(TUE_3_NOV_09_00),
    formatTime(FRI_13_NOV_14_10),
    formatTime(TUE_3_NOV_09_00),
    formatDate(new Date(2026, 0, 31).getTime()),
  ]).toEqual(["Fri", "3 Nov", "14:10", "09:00", "31 Jan"]);
});
