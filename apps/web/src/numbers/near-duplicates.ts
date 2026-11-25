// Near-duplicate scene-heading locations Check with a Merge action that rewrites rarer spellings into the canonical one.
import { findNearDuplicateLocations } from "@manent/revisions";
import { WRITING_TOOLS_WORDS } from "@manent/ui";
import { archiveSource } from "../archive/archive-source.ts";
import type { Check, CheckSource } from "../checks/sources.ts";
import { livePagination } from "../editor-host/live-editor.ts";

function countHeadingOccurrences(docId: string, spelling: string): number {
  const pagination = livePagination(docId);
  if (pagination === null) return 0;
  let count = 0;
  for (const block of pagination.blocks) {
    if (block.type !== "scene_heading") continue;
    const space = block.text.indexOf(" ");
    if (space < 0) continue;
    const rest = block.text.slice(space + 1);
    const dash = rest.lastIndexOf(" - ");
    const location = (dash < 0 ? rest : rest.slice(0, dash)).trim();
    if (location === spelling) count += 1;
  }
  return count;
}

export const nearDuplicateChecks: CheckSource = {
  id: "near_duplicates",
  find(docId): readonly Check[] {
    const pagination = livePagination(docId);
    if (pagination === null) return [];
    const groups = findNearDuplicateLocations(pagination.blocks);
    return groups.map((group) => ({
      id: group.canonical,
      sentence: WRITING_TOOLS_WORDS.nearDuplicateLocations(group.spellings),
      action: {
        label: WRITING_TOOLS_WORDS.merge,
        run() {
          const services = archiveSource.get();
          if (services === null) return;
          const mergedFroms: string[] = [];
          let mergedCount = 0;
          for (const variant of group.variants) {
            const occurrences = countHeadingOccurrences(docId, variant);
            if (occurrences > 0) {
              mergedFroms.push(variant);
              mergedCount += occurrences;
            }
          }
          if (mergedFroms.length === 0) return;
          const result = services.editor.run({
            kind: "rename_location",
            from: mergedFroms,
            to: group.canonical,
          });
          if (result?.ok) {
            services.messages.push({
              id: "locations_merged",
              text: WRITING_TOOLS_WORDS.mergedLocations(
                mergedFroms,
                group.canonical,
                mergedCount,
              ),
              actions: [
                {
                  label: WRITING_TOOLS_WORDS.undo,
                  commandId: "edit.undo",
                },
              ],
              lifetime: "reverse",
              ownWork: false,
            });
          }
        },
      },
    }));
  },
};
