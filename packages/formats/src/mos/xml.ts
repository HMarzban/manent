// Zero-dependency pure-JS XML parser and writer for MOS 2.8.5 messages.
import { FormatError } from "../script/model.ts";
import type { XmlNode } from "../xml/node.ts";
import { MOS_MAX_MESSAGE_BYTES } from "./utf16be.ts";

/** Maximum element nesting depth, root included. */
export const MOS_MAX_XML_DEPTH = 64;

const START_CHAR =
  "A-Z_a-z:\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const XML_NAME = new RegExp(
  `^[${START_CHAR}][${START_CHAR}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`,
  "u",
);
const NOT_XML_CHAR = new RegExp(
  "[^\\t\\n\\r\\u0020-\\uD7FF\\uE000-\\uFFFD\\u{10000}-\\u{10FFFF}]",
  "u",
);
const ESCAPE_PATTERN = new RegExp('[&<>"\\t\\n\\r]', "g");
const LINE_BREAKS = /\r\n?/g;

const PREDEFINED: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);
const FORBIDDEN_ATTRS = new Set(["__proto__", "constructor", "prototype"]);
const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\r": "&#13;",
};
const ATTR_ESCAPES: Readonly<Record<string, string>> = {
  ...TEXT_ESCAPES,
  '"': "&quot;",
  "\t": "&#9;",
  "\n": "&#10;",
};

function fail(
  message: string,
  code: "malformed" | "unsupported" | "too_large" = "malformed",
): never {
  throw new FormatError(code, message);
}

const isSpace = (ch: string): boolean =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

const isXmlCodePoint = (cp: number): boolean =>
  cp === 0x09 ||
  cp === 0x0a ||
  cp === 0x0d ||
  (cp >= 0x20 && cp <= 0xd7ff) ||
  (cp >= 0xe000 && cp <= 0xfffd) ||
  (cp >= 0x10000 && cp <= 0x10ffff);

function decodeEntities(raw: string): string {
  if (!raw.includes("&")) return raw;
  let out = "";
  let pos = 0;
  while (pos < raw.length) {
    const amp = raw.indexOf("&", pos);
    if (amp === -1) return out + raw.slice(pos);
    out += raw.slice(pos, amp);
    const semi = raw.indexOf(";", amp + 1);
    if (semi === -1) fail("unterminated XML entity reference");
    const ref = raw.slice(amp + 1, semi);
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      const hex = ref.slice(2);
      if (hex.length === 0 || !/^[0-9a-fA-F]+$/.test(hex))
        fail(`invalid hex character ref &${ref};`);
      const cp = Number.parseInt(hex, 16);
      if (!isXmlCodePoint(cp)) fail(`illegal XML code point U+${hex}`);
      out += String.fromCodePoint(cp);
    } else if (ref.startsWith("#")) {
      const dec = ref.slice(1);
      if (dec.length === 0 || !/^[0-9]+$/.test(dec))
        fail(`invalid decimal ref &${ref};`);
      const cp = Number.parseInt(dec, 10);
      if (!isXmlCodePoint(cp)) fail(`illegal XML code point ${cp}`);
      out += String.fromCodePoint(cp);
    } else {
      const resolved = PREDEFINED.get(ref);
      if (resolved === undefined) fail(`unknown XML entity &${ref};`);
      out += resolved;
    }
    pos = semi + 1;
  }
  return out;
}

interface OpenFrame {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: (XmlNode | string)[];
}

function finalizeChildren(
  children: (XmlNode | string)[],
): (XmlNode | string)[] {
  const hasElements = children.some((c) => typeof c !== "string");
  const merged: (XmlNode | string)[] = [];
  for (const child of children) {
    if (typeof child === "string") {
      if (hasElements && child.trim() === "") continue;
      if (merged.length > 0 && typeof merged.at(-1) === "string")
        merged[merged.length - 1] = (merged.at(-1) as string) + child;
      else merged.push(child);
    } else {
      merged.push(child);
    }
  }
  return merged;
}

/**
 * Pure-JS MOS XML parser: structurally rejects `<!DOCTYPE`, `<!ENTITY`, processing instructions,
 * nesting beyond `maxDepth` (64), payloads over `maxBytes` (1 MiB UTF-16BE), and prototype keys.
 */
export function parseMosXml(
  rawText: string,
  options?: { maxBytes?: number; maxDepth?: number },
): XmlNode {
  const maxBytes = options?.maxBytes ?? MOS_MAX_MESSAGE_BYTES;
  const maxDepth = options?.maxDepth ?? MOS_MAX_XML_DEPTH;
  if (rawText.length * 2 > maxBytes)
    fail(`MOS XML exceeds ${maxBytes} bytes`, "too_large");

  const source = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  if (NOT_XML_CHAR.test(source)) fail("MOS XML holds an illegal character");
  const text = source.replace(LINE_BREAKS, "\n");

  let pos = 0;
  const len = text.length;
  const stack: OpenFrame[] = [];
  let root: XmlNode | null = null;

  const skipSpaces = (): void => {
    while (pos < len && isSpace(text[pos]!)) pos += 1;
  };

  const readName = (): string => {
    const start = pos;
    while (pos < len) {
      const ch = text[pos]!;
      if (isSpace(ch) || ch === "=" || ch === "/" || ch === ">" || ch === "<")
        break;
      pos += 1;
    }
    const name = text.slice(start, pos);
    if (!XML_NAME.test(name)) fail(`invalid XML name "${name}"`);
    return name;
  };

  const pushNode = (node: XmlNode): void => {
    const parent = stack.at(-1);
    if (parent !== undefined) parent.children.push(node);
    else if (root !== null) fail("MOS XML has more than one root");
    else root = node;
  };

  while (pos < len) {
    const lt = text.indexOf("<", pos);
    if (lt === -1) {
      if (stack.length > 0) fail("unclosed XML element");
      if (text.slice(pos).trim() !== "") fail("unexpected text outside root");
      break;
    }

    if (lt > pos) {
      const chunk = text.slice(pos, lt);
      if (chunk.includes("]]>")) fail("unexpected ']]>' in character data");
      const parent = stack.at(-1);
      if (parent === undefined) {
        if (chunk.trim() !== "") fail("unexpected text outside root");
      } else {
        parent.children.push(decodeEntities(chunk));
      }
      pos = lt;
    }

    if (text.startsWith("<?", pos))
      fail("processing instructions are not allowed in MOS XML", "unsupported");

    if (text.startsWith("<!--", pos)) {
      const end = text.indexOf("-->", pos + 4);
      if (end === -1) fail("unterminated XML comment");
      if (text.slice(pos + 4, end).includes("--"))
        fail("XML comment cannot contain '--'");
      pos = end + 3;
      continue;
    }

    if (text.startsWith("<![CDATA[", pos)) {
      const parent = stack.at(-1);
      if (parent === undefined) fail("CDATA outside root element");
      const end = text.indexOf("]]>", pos + 9);
      if (end === -1) fail("unterminated CDATA section");
      parent.children.push(text.slice(pos + 9, end));
      pos = end + 3;
      continue;
    }

    if (text.startsWith("<!", pos))
      fail("DOCTYPE and ENTITY declarations are not allowed", "unsupported");

    if (text.startsWith("</", pos)) {
      pos += 2;
      const closeName = readName();
      skipSpaces();
      if (text[pos] !== ">") fail("expected '>' on closing tag");
      pos += 1;
      const frame = stack.pop();
      if (frame === undefined || frame.name !== closeName)
        fail(`mismatched closing tag </${closeName}>`);
      pushNode({
        name: frame.name,
        attributes: frame.attributes,
        children: finalizeChildren(frame.children),
      });
      continue;
    }

    pos += 1;
    const tagName = readName();
    if (stack.length + 1 > maxDepth)
      fail(`MOS XML nesting exceeds depth limit ${maxDepth}`);
    const attributes: Record<string, string> = {};
    let selfClosing = false;

    while (pos < len) {
      const hadSpace = pos < len && isSpace(text[pos]!);
      skipSpaces();
      if (text.startsWith("/>", pos)) {
        selfClosing = true;
        pos += 2;
        break;
      }
      if (text[pos] === ">") {
        pos += 1;
        break;
      }
      if (!hadSpace) fail("expected whitespace before attribute");
      const attrName = readName();
      if (FORBIDDEN_ATTRS.has(attrName) || Object.hasOwn(attributes, attrName))
        fail(`disallowed or duplicate attribute "${attrName}"`);
      skipSpaces();
      if (text[pos] !== "=") fail(`expected '=' after "${attrName}"`);
      pos += 1;
      skipSpaces();
      const quote = text[pos];
      if (quote !== '"' && quote !== "'")
        fail(`expected quoted value for "${attrName}"`);
      pos += 1;
      const endQuote = text.indexOf(quote, pos);
      if (endQuote === -1) fail(`unterminated attribute "${attrName}"`);
      const rawVal = text.slice(pos, endQuote);
      if (rawVal.includes("<")) fail("attribute value cannot contain '<'");
      attributes[attrName] = decodeEntities(rawVal);
      pos = endQuote + 1;
    }

    if (selfClosing) pushNode({ name: tagName, attributes, children: [] });
    else stack.push({ name: tagName, attributes, children: [] });
  }

  if (stack.length > 0 || root === null) fail("incomplete MOS XML");
  return root;
}

function escapeXml(
  value: string,
  table: Readonly<Record<string, string>>,
): string {
  if (NOT_XML_CHAR.test(value)) fail("MOS XML cannot hold control characters");
  return value.replace(ESCAPE_PATTERN, (c) => table[c] ?? c);
}

function serializeNode(node: XmlNode): string {
  if (!XML_NAME.test(node.name)) fail(`invalid MOS XML tag "${node.name}"`);
  let attrs = "";
  for (const [key, value] of Object.entries(node.attributes)) {
    if (!XML_NAME.test(key) || FORBIDDEN_ATTRS.has(key))
      fail(`invalid MOS XML attribute "${key}"`);
    attrs += ` ${key}="${escapeXml(value, ATTR_ESCAPES)}"`;
  }
  if (node.children.length === 0) return `<${node.name}${attrs}/>`;
  const inner = node.children
    .map((child) =>
      typeof child === "string"
        ? escapeXml(child, TEXT_ESCAPES)
        : serializeNode(child),
    )
    .join("");
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

/** Serialises a MOS XML tree without an XML declaration (MOS 2.8.5 TCP wire form). */
export function writeMosXml(root: XmlNode): string {
  return serializeNode(root);
}

export function mosElement(
  name: string,
  children: readonly (XmlNode | string)[] = [],
  attributes: Readonly<Record<string, string>> = {},
): XmlNode {
  return { name, attributes, children };
}

export function childElement(node: XmlNode, name: string): XmlNode | null {
  for (const child of node.children)
    if (typeof child !== "string" && child.name === name) return child;
  return null;
}

export function childElements(node: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = [];
  for (const child of node.children)
    if (typeof child !== "string" && child.name === name) found.push(child);
  return found;
}

export function elementText(node: XmlNode): string {
  return node.children
    .filter((child): child is string => typeof child === "string")
    .join("");
}
