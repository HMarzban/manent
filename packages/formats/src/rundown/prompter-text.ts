// Prompter text for a rundown: chosen rows' stories in run order from their current blocks.
import { formatPrompterStory, prompterBlocks } from "@manent/schema";
import { rowStoryHeading } from "./rundown-for-export.ts";
import type { RundownForExport } from "./rundown-for-export.ts";

/**
 * One UTF-8 text of the chosen rows' stories in run order: each story opens with `<row number>  <slug cell>`
 * and a blank line, then `formatPrompterStory(prompterBlocks(…))` of the story's current blocks.
 * Header rows and rows without a story are skipped.
 */
export function writePrompterText(rundown: RundownForExport): string {
  const sections: string[] = [];
  for (const row of rundown.rows) {
    if (row.kind !== "story" || row.story === null) continue;
    const heading = rowStoryHeading(row);
    const body = formatPrompterStory(prompterBlocks(row.story.blocks));
    sections.push(body === "" ? heading : `${heading}\n\n${body}`);
  }
  return sections.length === 0 ? "" : `${sections.join("\n\n")}\n`;
}
