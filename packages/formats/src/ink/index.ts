export { compileInk } from "./compile.ts";
export type { InkCompiled, InkProblem } from "./compile.ts";
export {
  inkSourceOf,
  joinInkProject,
  readInk,
  readInkBytes,
  writeInk,
} from "./files.ts";
export { createInkStory } from "./story.ts";
export type {
  InkActionResult,
  InkChoice,
  InkFault,
  InkPassage,
  InkStepResult,
  InkStory,
  InkVariable,
  InkVariableValue,
} from "./story.ts";
