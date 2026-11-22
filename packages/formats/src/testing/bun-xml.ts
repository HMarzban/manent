// The XML adapter the tests parse with: Bun's own parser, its tree reshaped to XmlNode's rules.
import type { XmlNode, XmlParser } from "../xml/node.ts";

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const XML_SPACE = /^[ \t\n\r]*$/;

function attributesOf(value: unknown): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (!isFields(value)) return attributes;
  for (const [key, text] of Object.entries(value)) {
    if (key === "__proto__")
      throw new SyntaxError("an attribute cannot be named __proto__");
    if (typeof text === "string") attributes[key] = text;
  }
  return attributes;
}

function toNode(value: unknown): XmlNode {
  if (!isFields(value) || typeof value.name !== "string")
    throw new SyntaxError("the parser gave something other than an element");
  const merged: (XmlNode | string)[] = [];
  const children = Array.isArray(value.children) ? value.children : [];
  for (const child of children) {
    const last = merged.at(-1);
    if (typeof child !== "string") {
      // a comment or a processing instruction has no name
      if (isFields(child) && typeof child.name === "string")
        merged.push(toNode(child));
    } else if (typeof last === "string")
      merged[merged.length - 1] = last + child;
    else merged.push(child);
  }
  const layout = (child: XmlNode | string): boolean =>
    typeof child === "string" &&
    XML_SPACE.test(child) &&
    merged.some((other) => typeof other !== "string");
  return {
    name: value.name,
    attributes: attributesOf(value.attributes),
    children:
      value.name === "Text" ? merged : merged.filter((child) => !layout(child)),
  };
}

/** Bun.XML as an XmlParser; throws Bun's SyntaxError for text that is not well-formed. */
export const bunXml: XmlParser = (text) =>
  toNode(Bun.XML.parse(text, { compact: false }));
