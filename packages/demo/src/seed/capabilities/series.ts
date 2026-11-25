// What the seed writes of a series and project index: settings, seasons, episodes, names, facts and the Board.
import type { EpisodeEntry, SeasonEntry } from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";
import type { SeedWorkspaceId } from "../catalogue.ts";

export interface SeedProjectRef {
  readonly projectId: string;
  readonly workspaceId: SeedWorkspaceId;
}

export interface SeedProjectName {
  readonly kind: "character" | "set" | "term";
  readonly name: string;
}

export interface SeedFact {
  readonly docId: string;
  readonly episodeId: string | null;
  readonly sceneHeadingId: string | null;
  readonly sceneLabel: string | null;
  readonly anchor: TextAnchor;
  readonly byUserId: string;
  readonly at: number;
}

export interface SeedBoardStoryline {
  readonly id: string;
  readonly title: string;
}

export interface SeedBoardCard {
  readonly id: string;
  readonly storylineId: string;
  readonly episodeId: string;
  readonly text: string;
  readonly linkBlockId: string | null;
}

export interface SeedSeries {
  /** Ensures the project's index exists and writes project settings (routing style and ladder to their maps). */
  setSettings(
    userId: string,
    project: SeedProjectRef,
    settings: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  /** Writes `seasons` into the project index's `seasons` map. */
  setSeasons(
    userId: string,
    project: SeedProjectRef,
    seasons: readonly SeasonEntry[],
  ): Promise<void>;
  /** Writes `episodes` into the project index's `episodes` map. */
  setEpisodes(
    userId: string,
    project: SeedProjectRef,
    episodes: readonly EpisodeEntry[],
  ): Promise<void>;
  /** Writes `names` into the project index's `names` map, returning their ids in order. */
  setNames(
    userId: string,
    project: SeedProjectRef,
    names: readonly SeedProjectName[],
  ): Promise<readonly string[]>;
  /** Writes `facts` into the project index's `facts` map, returning their ids in order. */
  setFacts(
    userId: string,
    project: SeedProjectRef,
    facts: readonly SeedFact[],
  ): Promise<readonly string[]>;
  /** Writes storylines and cards into the project index's `board` map with deterministic order keys. */
  setBoard(
    userId: string,
    project: SeedProjectRef,
    board: {
      storylines: readonly SeedBoardStoryline[];
      cards: readonly SeedBoardCard[];
    },
  ): Promise<void>;
}
