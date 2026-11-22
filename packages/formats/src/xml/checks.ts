// Parsing a file's XML through the parser a caller gives, with the refusals every reader shares.
import { FormatError } from "../script/model.ts";
import type { XmlNode, XmlParser } from "./node.ts";

/** Element levels, the root's included; a deeper tree is malformed. */
export const XML_DEPTH_LIMIT = 64;

// entity expansion needs a declaration, and a script file never holds one
const DECLARATIONS = ["<!DOCTYPE", "<!ENTITY"];

function depthOf(root: XmlNode): number {
  let deepest = 0;
  const open: [XmlNode, number][] = [[root, 1]];
  for (let next = open.pop(); next !== undefined; next = open.pop()) {
    const [node, depth] = next;
    deepest = Math.max(deepest, depth);
    for (const child of node.children)
      if (typeof child !== "string") open.push([child, depth + 1]);
  }
  return deepest;
}

/**
 * The tree `parseXml` makes of `text`. Throws FormatError "unsupported" for a document type or an entity
 * declaration, before parsing; "malformed", with the parser's error as its cause, when `parseXml` throws or
 * the tree is deeper than XML_DEPTH_LIMIT.
 */
export function parseXmlChecked(text: string, parseXml: XmlParser): XmlNode {
  const declared = DECLARATIONS.find((word) => text.includes(word));
  if (declared !== undefined)
    throw new FormatError(
      "unsupported",
      `a script file's xml cannot hold ${declared}`,
    );
  let root: XmlNode;
  try {
    root = parseXml(text);
  } catch (cause) {
    throw new FormatError("malformed", "the file is not well-formed xml", {
      cause,
    });
  }
  const depth = depthOf(root);
  if (depth > XML_DEPTH_LIMIT)
    throw new FormatError(
      "malformed",
      `xml may nest ${XML_DEPTH_LIMIT} elements deep, not ${depth}`,
    );
  return root;
}
