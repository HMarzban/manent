// Print with alternates: the script with each speech's alternates under its line, each marked as an alternate.
import type { BlockJSON, DocJSON } from "@manent/schema";
import { MATERIAL_WORDS } from "@manent/ui";
import type { MaterialSnapshot } from "../../send/what-options.ts";
import { alternatesBySpeech } from "./speech-alternates.ts";

/**
 * `doc` with, after each dialogue block, one more dialogue block per alternate of it, oldest first: the alternate's
 * text followed by the mark. Each takes the alternate's id, and the attributes of the line it stands under.
 */
export function withAlternates(
  doc: DocJSON,
  material: MaterialSnapshot,
): DocJSON {
  const bySpeech = alternatesBySpeech(material.alternates);
  const under = (block: BlockJSON): BlockJSON[] => {
    const id = block.attrs?.id;
    const kept =
      block.attrs?.type === "dialogue" && typeof id === "string"
        ? (bySpeech.get(id) ?? [])
        : [];
    return [
      block,
      ...kept.map((alternate): BlockJSON => ({
        type: "block",
        attrs: { ...block.attrs, id: alternate.id },
        content: [
          {
            type: "text",
            text: [alternate.text, MATERIAL_WORDS.printedMark]
              .filter((part) => part !== "")
              .join(" "),
          },
        ],
      })),
    ];
  };
  return {
    ...doc,
    content: doc.content?.map((section) => ({
      ...section,
      content: section.content?.flatMap(under),
    })),
  };
}
