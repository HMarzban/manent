import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

test("a quoted phrase matches only the row that holds it, with the unicode61 tokenizer", () => {
  const db = new Database(":memory:");
  db.run("CREATE VIRTUAL TABLE t USING fts5(body, tokenize='unicode61')");
  const insert = db.prepare("INSERT INTO t (body) VALUES (?)");
  for (const body of [
    "the Founding of the town",
    "founding fathers",
    "Tamsin Hale opens the door",
  ])
    insert.run(body);
  const rows = db
    .query("SELECT body FROM t WHERE t MATCH ?")
    .all('"the Founding"');
  expect(rows).toEqual([{ body: "the Founding of the town" }]);
  db.close();
});
