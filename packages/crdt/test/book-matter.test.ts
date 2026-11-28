import { expect, test } from "bun:test";
import {
  ORIGIN_TITLE_PAGE,
  bookMatter,
  createDoc,
  rebuildDoc,
  titlePage,
} from "../src/index.ts";

const VALID_SHA = "a".repeat(64);

test("bookMatter reads/writes all additive book matter fields on titlePage without disturbing classic titlePage fields", () => {
  const doc = createDoc();
  const tp = titlePage(doc);
  const bm = bookMatter(doc);
  const tpChanges: string[] = [];
  const bmChanges: string[] = [];
  const stopTp = tp.subscribe((fields) => tpChanges.push(...fields));
  const stopBm = bm.subscribe((fields) => bmChanges.push(...fields));

  tp.set("title", "The Salt Almanac", ORIGIN_TITLE_PAGE);
  bm.set("subtitle", "Tides of the North Channel", ORIGIN_TITLE_PAGE);
  bm.set("isbn", "978-0-00-000000-0", ORIGIN_TITLE_PAGE);
  bm.set("copyright", "© 2026 Dana Reyes", ORIGIN_TITLE_PAGE);
  bm.set("dedication", "For the harbour watch.", ORIGIN_TITLE_PAGE);
  bm.set("acknowledgments", "Thanks to Ardle Quay.", ORIGIN_TITLE_PAGE);
  bm.set(
    "aboutAuthor",
    "Dana Reyes writes coastal non-fiction.",
    ORIGIN_TITLE_PAGE,
  );
  bm.set("coverAssetId", VALID_SHA, ORIGIN_TITLE_PAGE);

  expect(tpChanges).toEqual(["title"]);
  expect(bmChanges).toEqual([
    "subtitle",
    "isbn",
    "copyright",
    "dedication",
    "acknowledgments",
    "aboutAuthor",
    "coverAssetId",
  ]);
  expect(bm.fields()).toEqual({
    subtitle: "Tides of the North Channel",
    isbn: "978-0-00-000000-0",
    copyright: "© 2026 Dana Reyes",
    dedication: "For the harbour watch.",
    acknowledgments: "Thanks to Ardle Quay.",
    aboutAuthor: "Dana Reyes writes coastal non-fiction.",
    coverAssetId: VALID_SHA,
  });
  expect(() => bm.set("coverAssetId", "not-a-sha", ORIGIN_TITLE_PAGE)).toThrow(
    TypeError,
  );

  // Preserved across rebuildDoc
  const result = rebuildDoc(doc, { clientId: 2 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const rebuilt = result.doc;
  expect(bookMatter(rebuilt).fields()).toEqual(bm.fields());
  expect(titlePage(rebuilt).get("title")).toBe("The Salt Almanac");

  stopTp();
  stopBm();
  rebuilt.destroy();
  doc.destroy();
});
