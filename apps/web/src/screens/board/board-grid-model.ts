// Derived lookup maps, storyline coverage stats, and SortableLists cell entries for BoardGrid.
import type { EpisodeEntry } from "@manent/crdt";
import { BOARD_WORDS } from "@manent/ui";
import { useMemo } from "react";
import { cardsInCell, cellKey } from "../../board/model.ts";
import type { BoardCard, BoardStoryline } from "../../board/model.ts";

export interface StorylineStats {
  readonly count: number;
  readonly unlinked: number;
  readonly coverage: readonly boolean[];
}

export function useBoardGridModel(args: {
  readonly allStorylines: readonly BoardStoryline[];
  readonly storylines: readonly BoardStoryline[];
  readonly episodes: readonly EpisodeEntry[];
  readonly cards: readonly BoardCard[];
  readonly collapsedStorylineIds: ReadonlySet<string>;
}) {
  const { allStorylines, storylines, episodes, cards, collapsedStorylineIds } =
    args;

  const storylineById = useMemo(
    () => new Map(storylines.map((s) => [s.id, s])),
    [storylines],
  );
  const storylineIndexById = useMemo(
    () => new Map(allStorylines.map((s, idx) => [s.id, idx])),
    [allStorylines],
  );
  const episodeById = useMemo(
    () => new Map(episodes.map((e) => [e.id, e])),
    [episodes],
  );
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const cardCountByEpisode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) {
      counts.set(card.episodeId, (counts.get(card.episodeId) ?? 0) + 1);
    }
    return counts;
  }, [cards]);

  const storylineStats = useMemo(() => {
    const episodeSet = new Set(episodes.map((e) => e.id));
    const stats = new Map<string, StorylineStats>();
    for (const storyline of storylines) {
      const own = cards.filter(
        (c) => c.storylineId === storyline.id && episodeSet.has(c.episodeId),
      );
      const filledEpisodes = new Set(own.map((c) => c.episodeId));
      stats.set(storyline.id, {
        count: own.length,
        unlinked: own.filter((c) => c.link === null).length,
        coverage: episodes.map((ep) => filledEpisodes.has(ep.id)),
      });
    }
    return stats;
  }, [storylines, episodes, cards]);

  const lists = useMemo(
    () =>
      storylines.flatMap((storyline) => {
        const collapsed = collapsedStorylineIds.has(storyline.id);
        return episodes.map((episode) => ({
          id: cellKey(storyline.id, episode.id),
          label: BOARD_WORDS.cellLabel(storyline.title, episode.number),
          items: collapsed
            ? []
            : cardsInCell(cards, storyline.id, episode.id).map((card) => ({
                id: card.id,
                label: BOARD_WORDS.cardLabel(
                  card.text,
                  episode.number,
                  storyline.title,
                ),
              })),
        }));
      }),
    [storylines, episodes, cards, collapsedStorylineIds],
  );

  return {
    storylineById,
    storylineIndexById,
    episodeById,
    cardById,
    cardCountByEpisode,
    storylineStats,
    lists,
  };
}
