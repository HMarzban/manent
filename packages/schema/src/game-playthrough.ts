// Pure, deterministic playthrough walker for Game Script blocks: scenes, nested choices/gathers, #set flags, and {condition} gates.
import {
  applySetStatement,
  evaluateCondition,
  parseSetStatement,
} from "./game-conditions.ts";
import type { FlagEntry, GameFlag, GameFlagValue } from "./game-conditions.ts";
import {
  collectNodeFlags,
  parseGameScenes,
  splitInlineTags,
  toRawBlocks,
} from "./game-parse.ts";
import type { GameSceneSummary, RawBlock, SceneNode } from "./game-parse.ts";
import type { BlockJSON } from "./json.ts";

export type { GameFlag, GameFlagValue, GameSceneSummary };

export interface GameChoiceOption {
  readonly index: number;
  readonly blockId: string;
  readonly text: string;
  readonly depth: number;
}

export interface GameRecordedChoice {
  readonly index: number;
  readonly text: string;
  readonly blockId?: string;
}

export interface GameEditedFlag {
  readonly name: string;
  readonly value: GameFlagValue;
}

export type GameTranscriptItem =
  | {
      readonly kind: "scene";
      readonly blockId: string;
      readonly heading: string;
      readonly sceneIndex: number;
    }
  | {
      readonly kind: "speech";
      readonly blockId: string;
      readonly character: string;
      readonly parenthetical: string | null;
      readonly text: string;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: "action";
      readonly blockId: string;
      readonly element: "action" | "general" | "shot" | "transition";
      readonly text: string;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: "cue";
      readonly blockId: string;
      readonly cueKind:
        "emote" | "camera" | "engine" | "tag" | "set" | "condition";
      readonly text: string;
    }
  | {
      readonly kind: "choice";
      readonly blockId: string;
      readonly text: string;
    };

export interface GamePlaythroughResult {
  readonly scenes: readonly GameSceneSummary[];
  readonly currentScene: GameSceneSummary | null;
  readonly transcript: readonly GameTranscriptItem[];
  readonly choices: readonly GameChoiceOption[];
  readonly flags: readonly GameFlag[];
  readonly keptChoices: readonly GameRecordedChoice[];
  readonly visitedBlockIds: readonly string[];
  readonly diverged: boolean;
  readonly ended: boolean;
}

export interface GamePlaythroughOptions {
  readonly choices?: readonly GameRecordedChoice[];
  readonly editedFlags?: readonly GameEditedFlag[];
  readonly startSceneId?: string | null;
}

/** Lists every scene in a Game Script in order, marking which scenes contain branching choices. */
export function listGameScenes(
  blocks: readonly BlockJSON[],
): GameSceneSummary[] {
  return parseGameScenes(toRawBlocks(blocks)).map((scene) => scene.summary);
}

/** Returns the enclosing scene ID for `blockId`, or null when `blockId` is not present. */
export function sceneIdForBlock(
  blocks: readonly BlockJSON[],
  blockId: string,
): string | null {
  let currentSceneId: string | null = null;
  for (const blk of toRawBlocks(blocks)) {
    if (blk.type === "scene_heading" || currentSceneId === null)
      currentSceneId = blk.id;
    if (blk.id === blockId) return currentSceneId;
  }
  return null;
}

/** Replays a Game Script deterministically from `startSceneId` (or the start) using `editedFlags` and `choices`. */
export function replayGameScript(
  blocks: readonly BlockJSON[],
  options: GamePlaythroughOptions = {},
): GamePlaythroughResult {
  const scenes = parseGameScenes(toRawBlocks(blocks));
  const summaries = scenes.map((scene) => scene.summary);
  const flags = new Map<string, FlagEntry>();
  for (const scene of scenes) collectNodeFlags(scene.nodes, flags);
  for (const edited of options.editedFlags ?? []) {
    flags.set(edited.name, {
      value: edited.value,
      manual: flags.get(edited.name)?.manual ?? false,
    });
  }
  const toFlags = (): GameFlag[] =>
    [...flags.entries()].map(([name, info]) => ({
      name,
      value: info.value,
      manual: info.manual,
    }));

  if (scenes.length === 0) {
    return {
      scenes: [],
      currentScene: null,
      transcript: [],
      choices: [],
      flags: toFlags(),
      keptChoices: [],
      visitedBlockIds: [],
      diverged: false,
      ended: true,
    };
  }

  const startIndex =
    options.startSceneId != null
      ? Math.max(
          0,
          scenes.findIndex(
            (scene) => scene.summary.id === options.startSceneId,
          ),
        )
      : 0;
  const recorded = options.choices ?? [];
  let choiceCursor = 0;
  let diverged = false;
  let pendingChoices: GameChoiceOption[] = [];
  let paused = false;
  const transcript: GameTranscriptItem[] = [];
  const visitedBlockIds: string[] = [];
  const keptChoices: GameRecordedChoice[] = [];
  let currentScene: GameSceneSummary = scenes[startIndex]!.summary;
  let pendingCharacter: string | null = null;
  let pendingParenthetical: string | null = null;
  const clearSpeech = (): void => {
    pendingCharacter = null;
    pendingParenthetical = null;
  };

  const emitBlock = (blk: RawBlock): void => {
    visitedBlockIds.push(blk.id);
    if (blk.type === "character") {
      pendingCharacter = blk.text.trim();
      pendingParenthetical = null;
      return;
    }
    if (blk.type === "parenthetical") {
      pendingParenthetical = blk.text.trim();
      return;
    }
    if (blk.type === "dialogue") {
      const { clean, tags } = splitInlineTags(blk.text);
      transcript.push({
        kind: "speech",
        blockId: blk.id,
        character: pendingCharacter ?? "",
        parenthetical: pendingParenthetical,
        text: clean,
        tags,
      });
      pendingParenthetical = null;
      return;
    }
    clearSpeech();
    if (
      blk.type === "emote" ||
      blk.type === "camera" ||
      blk.type === "engine"
    ) {
      transcript.push({
        kind: "cue",
        blockId: blk.id,
        cueKind: blk.type,
        text: blk.text.trim(),
      });
      return;
    }
    if (blk.type === "general") {
      const set = parseSetStatement(blk.text);
      if (set !== null) {
        applySetStatement(set, flags);
        transcript.push({
          kind: "cue",
          blockId: blk.id,
          cueKind: "set",
          text: blk.text.trim(),
        });
        return;
      }
      if (blk.text.trimStart().startsWith("#")) {
        transcript.push({
          kind: "cue",
          blockId: blk.id,
          cueKind: "tag",
          text: blk.text.trim(),
        });
        return;
      }
      const { clean, tags } = splitInlineTags(blk.text);
      transcript.push({
        kind: "action",
        blockId: blk.id,
        element: "general",
        text: clean,
        tags,
      });
      return;
    }
    const element: "action" | "shot" | "transition" =
      blk.type === "shot" || blk.type === "transition" ? blk.type : "action";
    const { clean, tags } = splitInlineTags(blk.text);
    transcript.push({
      kind: "action",
      blockId: blk.id,
      element,
      text: clean,
      tags,
    });
  };

  const walk = (nodes: readonly SceneNode[]): void => {
    for (const node of nodes) {
      if (paused) return;
      if (node.kind === "block") {
        emitBlock(node.block);
        continue;
      }
      if (node.kind === "gather_text") {
        clearSpeech();
        visitedBlockIds.push(node.blockId);
        const { clean, tags } = splitInlineTags(node.text);
        transcript.push({
          kind: "action",
          blockId: node.blockId,
          element: "general",
          text: clean,
          tags,
        });
        continue;
      }
      if (node.kind === "condition") {
        clearSpeech();
        if (evaluateCondition(node.expr, flags)) {
          visitedBlockIds.push(node.blockId);
          if (node.thenNodes.length > 0) {
            transcript.push({
              kind: "cue",
              blockId: node.blockId,
              cueKind: "condition",
              text: `{${node.rawExpr}}`,
            });
            walk(node.thenNodes);
          }
        } else if (node.elseNodes.length > 0) {
          walk(node.elseNodes);
        }
        continue;
      }
      clearSpeech();
      const eligible = node.branches.filter(
        (branch) =>
          branch.condition === null ||
          evaluateCondition(branch.condition, flags),
      );
      if (eligible.length === 0) continue;
      const optionsList: GameChoiceOption[] = eligible.map((branch, index) => ({
        index,
        blockId: branch.blockId,
        text: branch.text,
        depth: branch.depth,
      }));
      if (choiceCursor >= recorded.length) {
        pendingChoices = optionsList;
        paused = true;
        return;
      }
      const rec = recorded[choiceCursor]!;
      const byBlock =
        rec.blockId !== undefined
          ? eligible.find((branch) => branch.blockId === rec.blockId)
          : undefined;
      const byIndex = eligible[rec.index];
      const matched =
        (byBlock !== undefined && byBlock.text === rec.text
          ? byBlock
          : undefined) ??
        (byIndex !== undefined && byIndex.text === rec.text
          ? byIndex
          : undefined) ??
        eligible.find((branch) => branch.text === rec.text) ??
        byBlock;
      if (matched === undefined) {
        diverged = true;
        pendingChoices = optionsList;
        paused = true;
        return;
      }
      choiceCursor++;
      keptChoices.push({
        index: eligible.indexOf(matched),
        text: matched.text,
        blockId: matched.blockId,
      });
      visitedBlockIds.push(matched.blockId);
      transcript.push({
        kind: "choice",
        blockId: matched.blockId,
        text: matched.text,
      });
      walk(matched.body);
    }
  };

  for (let i = startIndex; i < scenes.length; i++) {
    if (paused) break;
    const scene = scenes[i]!;
    currentScene = scene.summary;
    clearSpeech();
    if (scene.headingBlock !== null) {
      visitedBlockIds.push(scene.headingBlock.id);
      transcript.push({
        kind: "scene",
        blockId: scene.headingBlock.id,
        heading: scene.summary.heading,
        sceneIndex: scene.summary.index,
      });
    }
    walk(scene.nodes);
  }

  return {
    scenes: summaries,
    currentScene,
    transcript,
    choices: pendingChoices,
    flags: toFlags(),
    keptChoices,
    visitedBlockIds,
    diverged,
    ended: !paused,
  };
}
