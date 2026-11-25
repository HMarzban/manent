// The Checks row both forms share: what the script font cannot draw, which prints as boxes.
import { engineFor } from "@manent/pagination";
import type { Engine, Pagination } from "@manent/pagination";
import { EDITOR_WORDS, joinNames } from "@manent/ui";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { CheckMark } from "./check-mark.tsx";

const SHOWN_CHARACTERS = 12;

function engineOf(p: Pagination): Engine {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `no engine of version ${p.engineVersion} in this build`,
    );
  return engine;
}

/** Adds to `found` each cluster of `text` that overlaps one of `runs` (the engine's `offFontRanges`) and takes a cell. */
function addOffFont(
  engine: Engine,
  text: string,
  runs: readonly number[],
  found: Set<string>,
): void {
  let run = 0;
  for (let at = 0; at < text.length && run < runs.length;) {
    const end = engine.graphemeEnd(text, at);
    while (run < runs.length && runs[run + 1]! <= at) run += 2;
    if (
      run < runs.length &&
      runs[run]! < end &&
      engine.clusterCells(text, at, end, false) > 0
    )
      found.add(text.slice(at, end));
    at = end;
  }
}

/** Null when the script font draws every character; else the sentence naming each such cluster once, in document order, the first 12. */
export function outsideFontSentence(p: Pagination): string | null {
  const engine = engineOf(p);
  const found = new Set<string>();
  for (const { text } of p.blocks) {
    const runs = engine.offFontRanges(text);
    if (runs.length > 0) addOffFont(engine, text, runs, found);
  }
  if (found.size === 0) return null;
  const shown = [...found].slice(0, SHOWN_CHARACTERS);
  return EDITOR_WORDS.send.outsideFont(found.size, joinNames(shown));
}

/** The Checks row, with its mark before the sentence; null when the script font draws every character. */
export function outsideFontRow(p: Pagination): SendRow | null {
  const sentence = outsideFontSentence(p);
  if (sentence === null) return null;
  return {
    id: "checks",
    content: (
      <span className="flex items-start gap-2">
        <CheckMark ok={false} />
        {sentence}
      </span>
    ),
  };
}
