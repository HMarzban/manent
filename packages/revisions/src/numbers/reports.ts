// Pure report row builders (characters, scenes, locations) and Animation pickup-lines diff.
import { letters } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import type { BlockJSON } from "@manent/schema";
import {
  cueName,
  formatEighths,
  numbersOf,
  pageLabelMap,
  parseSceneLocation,
} from "./numbers.ts";

export interface CharacterReportRow {
  readonly name: string;
  readonly speeches: number;
  readonly words: number;
  readonly scenes: number;
  readonly firstPage: string;
}

export interface SceneReportRow {
  readonly number: string;
  readonly heading: string;
  readonly page: string;
  readonly length: string;
  readonly characters: string;
}

export interface SceneReportOptions {
  readonly locked?: boolean;
  readonly eighthsByBlockId?: ReadonlyMap<string, number>;
}

export type InteriorOrExterior =
  "Interior" | "Exterior" | "Interior and exterior" | "";

export interface LocationReportRow {
  readonly location: string;
  readonly interiorOrExterior: InteriorOrExterior;
  readonly scenes: number;
  readonly pages: string;
}

export interface PickupLineRow {
  readonly character: string;
  readonly line: string;
  readonly page: string;
}

const EIGHTHS_PER_PAGE = 8;

/** Rows for the Character report: Name, Speeches, Dialogue words, Scenes, First page. */
export function characterReportRows(
  pagination: Pagination,
): readonly CharacterReportRow[] {
  const labels = pageLabelMap(pagination);
  const { characters } = numbersOf(
    pagination.blocks,
    pagination.pages.length,
    labels,
  );
  return characters.map((character) => ({
    name: character.name,
    speeches: character.speeches,
    words: character.words,
    scenes: character.scenes,
    firstPage: character.firstPage ?? "",
  }));
}

function blockLines(pagination: Pagination, index: number): number {
  const metric = pagination.metrics[index];
  if (metric === undefined || metric.lines === 0) return 0;
  return metric.lines + metric.spec.spaceBefore;
}

function sceneLengthLabel(
  lines: number,
  linesPerPage: number,
  locked: boolean,
  overrideEighths: number | undefined,
): string {
  if (locked) {
    const eighths =
      overrideEighths ??
      Math.max(1, Math.ceil((EIGHTHS_PER_PAGE * lines) / linesPerPage));
    return formatEighths(eighths);
  }
  return lines === 1 ? "1 line" : `${lines} lines`;
}

/** Rows for the Scene report: Number, Heading, Page, Length, Characters. */
export function sceneReportRows(
  pagination: Pagination,
  options: SceneReportOptions = {},
): readonly SceneReportRow[] {
  const labels = pageLabelMap(pagination);
  const { scenesLettered } = pagination.profile.furniture;
  const { linesPerPage } = pagination.profile;
  const locked = options.locked === true;
  const rows: SceneReportRow[] = [];

  let sceneCount = 0;
  let openScene: {
    readonly blockId: string;
    readonly number: string;
    readonly heading: string;
    readonly page: string;
    lines: number;
    readonly speakerKeys: Set<string>;
    readonly speakers: string[];
  } | null = null;

  const closeScene = (): void => {
    if (openScene === null) return;
    rows.push({
      number: openScene.number,
      heading: openScene.heading,
      page: openScene.page,
      length: sceneLengthLabel(
        openScene.lines,
        linesPerPage,
        locked,
        options.eighthsByBlockId?.get(openScene.blockId),
      ),
      characters: openScene.speakers.join(", "),
    });
    openScene = null;
  };

  for (let i = 0; i < pagination.blocks.length; i++) {
    const block = pagination.blocks[i]!;
    if (block.type === "act_break" && block.kind !== "end_of_act") {
      closeScene();
      continue;
    }
    if (block.type === "scene_heading") {
      closeScene();
      sceneCount += 1;
      const number =
        block.num ??
        (scenesLettered ? letters(sceneCount) : String(sceneCount));
      openScene = {
        blockId: block.id,
        number,
        heading: block.text.trim(),
        page: labels[i] ?? "",
        lines: blockLines(pagination, i),
        speakerKeys: new Set<string>(),
        speakers: [],
      };
      continue;
    }
    if (openScene !== null) {
      openScene.lines += blockLines(pagination, i);
      if (block.type === "character") {
        const name = cueName(block.text);
        const key = name.toLowerCase();
        if (name !== "" && !openScene.speakerKeys.has(key)) {
          openScene.speakerKeys.add(key);
          openScene.speakers.push(name);
        }
      }
    }
  }
  closeScene();
  return rows;
}

/** Rows for the Location report: Location, Interior or exterior, Scenes, Pages. */
export function locationReportRows(
  pagination: Pagination,
): readonly LocationReportRow[] {
  const labels = pageLabelMap(pagination);
  const byLocation = new Map<
    string,
    {
      readonly location: string;
      hasInterior: boolean;
      hasExterior: boolean;
      scenes: number;
      readonly pageSet: Set<string>;
      readonly pageList: string[];
    }
  >();

  for (let i = 0; i < pagination.blocks.length; i++) {
    const block = pagination.blocks[i]!;
    if (block.type !== "scene_heading") continue;
    const parsed = parseSceneLocation(block.text);
    if (parsed.location === "") continue;
    let entry = byLocation.get(parsed.location);
    if (entry === undefined) {
      entry = {
        location: parsed.location,
        hasInterior: false,
        hasExterior: false,
        scenes: 0,
        pageSet: new Set<string>(),
        pageList: [],
      };
      byLocation.set(parsed.location, entry);
    }
    entry.scenes += 1;
    if (parsed.intro === "interior" || parsed.intro === "both") {
      entry.hasInterior = true;
    }
    if (parsed.intro === "exterior" || parsed.intro === "both") {
      entry.hasExterior = true;
    }
    const page = labels[i] ?? "";
    if (page !== "" && !entry.pageSet.has(page)) {
      entry.pageSet.add(page);
      entry.pageList.push(page);
    }
  }

  return [...byLocation.values()].map((entry) => {
    const interiorOrExterior: InteriorOrExterior =
      entry.hasInterior && entry.hasExterior
        ? "Interior and exterior"
        : entry.hasInterior
          ? "Interior"
          : entry.hasExterior
            ? "Exterior"
            : "";
    return {
      location: entry.location,
      interiorOrExterior,
      scenes: entry.scenes,
      pages: entry.pageList.join(", "),
    };
  });
}

function blockJsonText(block: BlockJSON): string {
  if (block.content === undefined) return "";
  let out = "";
  for (const run of block.content) out += run.text;
  return out;
}

/**
 * Pickup lines diff: every `dialogue` block in `pagination` whose text differs from the
 * `dialogue` block with the same `attrs.id` in `baselineBlocks` or was added since.
 */
export function pickupLineRows(
  pagination: Pagination,
  baselineBlocks: readonly BlockJSON[],
): readonly PickupLineRow[] {
  const baselineDialogue = new Map<string, string>();
  for (const block of baselineBlocks) {
    if (block.attrs?.type !== "dialogue") continue;
    const id = block.attrs.id;
    if (typeof id === "string" && id !== "") {
      baselineDialogue.set(id, blockJsonText(block));
    }
  }

  const labels = pageLabelMap(pagination);
  const rows: PickupLineRow[] = [];
  let currentCharacter = "";

  for (let i = 0; i < pagination.blocks.length; i++) {
    const block = pagination.blocks[i]!;
    if (block.type === "character") {
      currentCharacter = cueName(block.text);
      continue;
    }
    if (block.type === "parenthetical") continue;
    if (block.type === "dialogue") {
      const prior = baselineDialogue.get(block.id);
      if (prior === undefined || prior !== block.text) {
        rows.push({
          character: currentCharacter,
          line: block.text,
          page: labels[i] ?? "",
        });
      }
      continue;
    }
    currentCharacter = "";
  }
  return rows;
}
