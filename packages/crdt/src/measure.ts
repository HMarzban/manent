// How large a document has grown against what it holds: the numbers a rebuild is judged by.
import * as Y from "yjs";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { FRAGMENT_NAME, isElement, liveItemsOf } from "./mapping.ts";
import { readStateVector } from "./vectors.ts";

export interface DocMeasure {
  liveBytes: number;
  plainBytes: number;
  clientIds: number;
  largestSection: number;
}

/** Exact UTF-8 byte length of a JS string without allocating a Uint8Array (matches TextEncoder). */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * liveBytes: the encoded state's length. plainBytes: UTF-8 bytes of every block's text. clientIds: entries of the state vector.
 * largestSection: the most blocks in one section of the script body.
 */
export function measureDoc(doc: CrdtDoc, liveBytes?: number): DocMeasure {
  const ydoc = yDocOf(doc);
  const fragment = ydoc.getXmlFragment(FRAGMENT_NAME);
  let plainBytes = 0;
  let largestSection = 0;
  for (const section of fragment.toArray()) {
    if (!isElement(section, "section")) continue;
    let blocks = 0;
    for (const block of section.toArray()) {
      if (!isElement(block, "block")) continue;
      blocks += 1;
      for (const child of block.toArray()) {
        if (!(child instanceof Y.XmlText)) continue;
        for (const item of liveItemsOf(ydoc.store, child)) {
          if (item.content instanceof Y.ContentString)
            plainBytes += utf8ByteLength(item.content.str);
        }
      }
    }
    if (blocks > largestSection) largestSection = blocks;
  }
  return {
    liveBytes: liveBytes ?? doc.encodeState().byteLength,
    plainBytes,
    clientIds: readStateVector(doc.encodeStateVector()).size,
    largestSection,
  };
}
