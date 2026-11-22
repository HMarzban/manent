import { expect, test } from "bun:test";
import {
  IMPORT_MAP,
  IMPORT_RECORD_KEY,
  NOTES_MAP,
  jsonMap,
  rebuildDoc,
  scriptDocFromJSON,
} from "../src/index.ts";
import { SAMPLE, SECOND_ID } from "./helpers.ts";

const NOTE = {
  v: 1,
  anchor: {
    blockId: SECOND_ID,
    start: 15,
    end: 18,
    quote: "red",
    prefix: "A kite drags a ",
    suffix: " ribbon across t",
  },
  text: "Should the ribbon be the lamp's colour?",
  writerName: "Dana Reyes",
  at: 1_763_000_000_000,
};

const RECORD_JSON = {
  v: 1,
  from: "fountain",
  title: "The Lamp Room",
  fileName: "the-lamp-room.fountain",
  fileSha256: "0".repeat(64),
  importedAt: 1_763_000_000_000,
  importedByUserId: "user-dana",
  counts: { pages: 1, scenes: 1, notes: 1 },
  overflowing: [],
  coloursMapped: 0,
  kept: [],
  unread: [],
  production: null,
  lockKey: null,
};

test("a rebuild copies every note and the import record, entry by entry", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  jsonMap(doc, NOTES_MAP).set("n1", NOTE);
  jsonMap(doc, IMPORT_MAP).set(IMPORT_RECORD_KEY, RECORD_JSON);
  const rebuilt = rebuildDoc(doc, { clientId: 1 });
  if (!rebuilt.ok) throw new Error(rebuilt.code);
  expect([
    jsonMap(rebuilt.doc, NOTES_MAP).entries(),
    jsonMap(rebuilt.doc, IMPORT_MAP).get(IMPORT_RECORD_KEY),
  ]).toEqual([{ n1: NOTE }, RECORD_JSON]);
});

test("a script with notes is no longer an unknown root to a rebuild", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  jsonMap(doc, NOTES_MAP).set("n1", NOTE);
  expect(rebuildDoc(doc, { clientId: 1 }).ok).toBe(true);
});
