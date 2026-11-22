// formats' own XML serialiser: what it writes, every adapter reads back to the same tree.
import type { XmlNode } from "./node.ts";

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
const INDENT = "  ";

// XML 1.0's NameStartChar and NameChar
const START =
  "A-Z_a-z:\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const XML_NAME = new RegExp(
  `^[${START}][${START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`,
  "u",
);
// everything outside XML 1.0's Char, lone surrogates included
const NOT_XML_CHAR = new RegExp(
  "[^\\t\\n\\r\\u0020-\\uD7FF\\uE000-\\uFFFD\\u{10000}-\\u{10FFFF}]",
  "u",
);

const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  // a parser turns a literal CR into LF
  "\r": "&#13;",
};
const ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = {
  ...TEXT_ESCAPES,
  '"': "&quot;",
  "\t": "&#9;",
  "\n": "&#10;",
};
const ESCAPED = new RegExp('[&<>"\\t\\n\\r]', "g");

function checkedName(name: string): string {
  if (!XML_NAME.test(name))
    throw new RangeError(`an XML name cannot be ${JSON.stringify(name)}`);
  return name;
}

function escaped(
  value: string,
  escapes: Readonly<Record<string, string>>,
): string {
  const bad = NOT_XML_CHAR.exec(value);
  if (bad !== null) {
    const code = bad[0].codePointAt(0) ?? 0;
    const hex = code.toString(16).toUpperCase().padStart(4, "0");
    throw new RangeError(`XML cannot hold the character U+${hex}`);
  }
  return value.replace(ESCAPED, (c) => escapes[c] ?? c);
}

function openTag(node: XmlNode): string {
  const attributes = Object.entries(node.attributes).map(
    ([key, value]) =>
      ` ${checkedName(key)}="${escaped(value, ATTRIBUTE_ESCAPES)}"`,
  );
  return `<${checkedName(node.name)}${attributes.join("")}`;
}

/** The element with nothing added between its children, as an element holding text needs. */
function inline(node: XmlNode): string {
  const open = openTag(node);
  if (node.children.length === 0) return `${open}/>`;
  const inner = node.children
    .map((child) =>
      typeof child === "string" ? escaped(child, TEXT_ESCAPES) : inline(child),
    )
    .join("");
  return `${open}>${inner}</${node.name}>`;
}

function element(node: XmlNode, depth: number): string {
  const pad = INDENT.repeat(depth);
  const elements = node.children.filter(
    (child): child is XmlNode => typeof child !== "string",
  );
  if (elements.length === 0 || elements.length < node.children.length)
    return `${pad}${inline(node)}\n`;
  const inner = elements.map((child) => element(child, depth + 1)).join("");
  return `${pad}${openTag(node)}>\n${inner}${pad}</${node.name}>\n`;
}

/**
 * The document holding `root`: element-only content indented two spaces a level, an element holding text on
 * one line. Throws a RangeError naming a name that is not an XML name or a character XML cannot hold.
 */
export function writeXml(root: XmlNode): string {
  return DECLARATION + element(root, 0);
}
