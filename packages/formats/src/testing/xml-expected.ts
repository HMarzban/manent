// The tree every XML adapter makes of each fixture under test/fixtures/xml/, written by hand.
import type { XmlNode } from "../xml/node.ts";

const leaf = (
  name: string,
  children: readonly (XmlNode | string)[] = [],
  attributes: Readonly<Record<string, string>> = {},
): XmlNode => ({ name, attributes, children });

/** Each fixture's tree, by file name. */
export const XML_EXPECTED: Readonly<Record<string, XmlNode>> = Object.freeze({
  "plain.xml": leaf(
    "Script",
    [
      leaf(
        "Scene",
        [
          leaf("Heading", ["INT. LAMP ROOM - NIGHT"]),
          leaf("Action", ["The lens turns. Salt on the glass."]),
        ],
        { Number: "1" },
      ),
      leaf("Scene", [], { Number: "2" }),
    ],
    { Title: "The Lamp Room" },
  ),
  "mixed.xml": leaf("Log", [
    leaf(
      "Entry",
      [
        "The lamp ",
        leaf("Lit", ["burns"]),
        " until dawn, ",
        leaf("Lit", ["then"]),
        " the gulls.",
      ],
      { By: "Dana Reyes" },
    ),
    leaf("Entry", ["Fog from the north", leaf("Mark")], { By: "Sam Okafor" }),
  ]),
  "whitespace.xml": leaf("Content", [
    leaf("Paragraph", [leaf("Text", ["  The keeper  waits.\t"])], {
      Type: "Action",
    }),
    leaf("Paragraph", [leaf("Text", [" "])], { Type: "Dialogue" }),
    leaf("Note", ["\n    Kept as it is.\n  "]),
  ]),
  "cdata.xml": leaf("Notes", [
    leaf("Note", ["Keep <the salt> & the glass."], { Author: "Priya Nair" }),
    leaf("Note", ["Before the <storm> after"]),
  ]),
  "entities.xml": leaf("Lines", [
    leaf("Line", ["<keeper> & gulls"], { Says: `"Salt" & 'glass' <3>` }),
    leaf("Line", ["Dana’s lamp"]),
  ]),
});
