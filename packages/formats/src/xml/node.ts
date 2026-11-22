// The XML tree every reader walks, and the parser it is given to build one.

/**
 * An element as every adapter gives it: comments and processing instructions dropped, adjacent strings merged, text exact;
 * a string of whitespace only that stands beside an element sibling is layout and is dropped, except inside an element named `Text`
 * (FDX's runs, where a space is the text). An attribute named `__proto__` cannot be an own key: the adapter throws on it.
 */
export interface XmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly (XmlNode | string)[];
}

/** Throws anything for input that is not well-formed; the reader turns it into FormatError("malformed"). */
export type XmlParser = (text: string) => XmlNode;
