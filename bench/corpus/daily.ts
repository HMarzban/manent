// A daily document reused for weeks: each day's script deleted and the next one typed into the
// same document. The wrong practice, measured on purpose beside a new document each day.
import { blockIds, loadDoc, scriptBody, scriptDocFromJSON } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createRng } from "@manent/demo";
import type { DocJSON } from "@manent/schema";
import { ageSession } from "../crdt/aged.ts";
import { documentOfPages } from "./documents.ts";

/** The client id of the first day's script; every later writer takes the next one. */
const FIRST_CLIENT_ID = 1;

function scriptOf(pages: number, seed: number): DocJSON {
  return documentOfPages({
    format: "screenplay",
    pages,
    seed,
    sections: "even",
  }).doc;
}

/** Every block of `doc` deleted and the blocks of `script` inserted in their place, as one transaction. */
function replaceScript(doc: CrdtDoc, script: DocJSON): void {
  const ids = blockIds(doc);
  const blocks = (script.content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  scriptBody(doc).write((w) => {
    for (const id of ids)
      if (!w.deleteBlock(id))
        throw new RangeError(`a day's script lost the block ${id}`);
    w.insertBlocks(null, blocks);
  });
}

/**
 * A screenplay of `pages` pages (documentOfPages, `seed`) written by client id 1; then, each day,
 * `sessionsPerDay` sessions of `editsPerSession` edits through ageSession, and under one more client
 * id every block deleted and the screenplay of the next seed inserted; repeated `days` times. Client
 * ids are 2, 3, 4, … in the order used, and every draw comes from one generator seeded with `seed`.
 */
export function reuseDaily(options: {
  pages: number;
  days: number;
  sessionsPerDay: number;
  editsPerSession: number;
  seed: number;
}): CrdtDoc {
  const { pages, days, sessionsPerDay, editsPerSession, seed } = options;
  const random = createRng(seed).next;
  let clientId = FIRST_CLIENT_ID;
  let doc = scriptDocFromJSON(scriptOf(pages, seed), { clientId });
  const adopt = (next: CrdtDoc): void => {
    doc.destroy();
    doc = next;
  };
  for (let day = 1; day <= days; day++) {
    for (let session = 0; session < sessionsPerDay; session++) {
      clientId += 1;
      adopt(ageSession(doc, { clientId, edits: editsPerSession, random }));
    }
    clientId += 1;
    adopt(loadDoc(doc.encodeState(), { clientId }));
    replaceScript(doc, scriptOf(pages, seed + day));
  }
  return doc;
}
