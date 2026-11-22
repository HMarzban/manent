// The browser's XML parser as the formats' readers take it: DOMParser's tree reshaped to XmlNode's rules.
import type { XmlNode, XmlParser } from "@manent/formats";

const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const XML_SPACE = /^[ \t\n\r]*$/;

function attributesOf(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const { name, value } of element.attributes) {
    if (name === "__proto__")
      throw new SyntaxError("an attribute cannot be named __proto__");
    attributes[name] = value;
  }
  return attributes;
}

function toNode(element: Element): XmlNode {
  const merged: (XmlNode | string)[] = [];
  for (const child of element.childNodes) {
    if (child instanceof Element) {
      merged.push(toNode(child));
      continue;
    }
    // a comment or a processing instruction is dropped
    if (child.nodeType !== TEXT_NODE && child.nodeType !== CDATA_SECTION_NODE)
      continue;
    const text = child.nodeValue ?? "";
    const last = merged.at(-1);
    if (typeof last === "string") merged[merged.length - 1] = last + text;
    else merged.push(text);
  }
  const layout = (child: XmlNode | string): boolean =>
    typeof child === "string" &&
    XML_SPACE.test(child) &&
    merged.some((other) => typeof other !== "string");
  return {
    name: element.nodeName,
    attributes: attributesOf(element),
    children:
      element.nodeName === "Text"
        ? merged
        : merged.filter((child) => !layout(child)),
  };
}

/** DOMParser as an XmlParser; throws a SyntaxError for text that is not well-formed XML. */
export const domXml: XmlParser = (text) => {
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  if (parsed.getElementsByTagName("parsererror").length > 0)
    throw new SyntaxError("the text is not well-formed XML");
  const root = parsed.documentElement;
  if (root === null) throw new SyntaxError("the text holds no element");
  return toNode(root);
};
