import { Plugin } from "prosemirror-state";
import type { Command } from "prosemirror-state";

/** What the timing plugin tells its sink after each change of the script or the selection. */
export interface TimingFacts {}

export interface TimingSink {
  publish(facts: TimingFacts): void;
}

export function timingPlugin(_options: {
  sink: TimingSink;
  words: { unreadTime: string };
}): Plugin {
  return new Plugin({});
}

export const excludeFromTiming: Command = () => false;

export const includeInTiming: Command = () => false;
