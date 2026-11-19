// How large a document has grown against what it holds: the numbers a rebuild is judged by.
import type { CrdtDoc } from "./doc.ts";
import { readStateVector } from "./vectors.ts";
import { scriptBody } from "./writer.ts";

export interface DocMeasure {
  liveBytes: number;
  plainBytes: number;
  clientIds: number;
  largestSection: number;
}

const UTF8 = new TextEncoder();

/**
 * liveBytes: the encoded state's length. plainBytes: UTF-8 bytes of every block's text. clientIds: entries of the state vector.
 * largestSection: the most blocks in one section of the script body.
 */
export function measureDoc(doc: CrdtDoc): DocMeasure {
  const sections = scriptBody(doc).materialize().content ?? [];
  let plainBytes = 0;
  for (const section of sections)
    for (const block of section.content ?? [])
      for (const run of block.content ?? [])
        plainBytes += UTF8.encode(run.text).byteLength;
  return {
    liveBytes: doc.encodeState().byteLength,
    plainBytes,
    clientIds: readStateVector(doc.encodeStateVector()).size,
    largestSection: Math.max(
      0,
      ...sections.map((section) => (section.content ?? []).length),
    ),
  };
}
