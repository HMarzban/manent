// Bars in the page margin beside the blocks a person is asked to look at.
import { Plugin } from "prosemirror-state";

export function marginMarksPlugin(_options: {
  blockIds: () => readonly string[];
  label: string;
  onActivate(blockId: string): void;
}): Plugin {
  return new Plugin({});
}
