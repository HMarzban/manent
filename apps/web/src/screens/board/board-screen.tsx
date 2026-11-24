// The Board screen in the document frame: one board per series project, filtered by season, with keyboard and pointer moves.
import type { EpisodeEntry } from "@manent/crdt";
import { DEMO_PEOPLE } from "@manent/demo";
import { BOARD_WORDS, Button, DOCUMENT_WORDS, messageFor } from "@manent/ui";
import type { SortableListsHandle } from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { registerBoardController } from "../../board/board-actions.ts";
import { useEpisodeScenes } from "../../board/episode-scenes.ts";
import { cardsInCell, cellKey } from "../../board/model.ts";
import type { BoardCard } from "../../board/model.ts";
import { useBoardData } from "../../board/use-board-data.ts";
import { useBoardMutations } from "../../board/use-board-mutations.ts";
import { focusHeading } from "../../focus.ts";
import { useServices } from "../../services/context.tsx";
import { pageTitle } from "../../text.ts";
import { BoardStatusBar, BoardTitleBar } from "./board-bars.tsx";
import { BoardGrid } from "./board-grid.tsx";
import type { AddingCardCell } from "./board-grid.tsx";

const route = getRouteApi("/p/$projectId/board");

export function BoardScreen(): ReactNode {
  const { projectId }: { projectId: string } = route.useParams();
  const { season: seasonParam }: { season: string | null } = route.useSearch();
  const navigate = useNavigate();
  const { userId, messages } = useServices();
  const data = useBoardData(projectId, seasonParam);
  const scenesByScript = useEpisodeScenes(data.episodes);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null);
  const [addingStoryline, setAddingStoryline] = useState(false);
  const [addingCardCell, setAddingCardCell] = useState<AddingCardCell | null>(
    null,
  );
  const sortableRef = useRef<SortableListsHandle | null>(null);

  const onCardRemoved = useCallback((cardId: string) => {
    setSelectedCardId((prev) => (prev === cardId ? null : prev));
  }, []);
  const mutations = useBoardMutations(data, {
    onCardCreated: setSelectedCardId,
    onCardRemoved,
  });

  // on a project that is not a series the route shows the Library
  useEffect(() => {
    if (data.lookup.status === "not_series") {
      void navigate({ href: "/", replace: true });
    }
  }, [data.lookup.status, navigate]);

  const projectTitle =
    data.lookup.status === "ready" ? data.lookup.project.title : null;

  useEffect(() => {
    if (projectTitle === null) return;
    focusHeading(document);
  }, [projectId, projectTitle]);

  useEffect(() => {
    if (projectTitle === null) return;
    const person = DEMO_PEOPLE.find((p) => p.userId === userId);
    document.title = pageTitle(
      BOARD_WORDS.title(projectTitle),
      person?.name ?? null,
    );
  }, [projectTitle, userId]);

  const handleOpenCard = useCallback(
    (card: BoardCard, episode: EpisodeEntry): void => {
      const scriptId = episode.docIds.script;
      if (scriptId === null) return;
      const href =
        card.link === null
          ? `/s/${scriptId}`
          : `/s/${scriptId}?at=${encodeURIComponent(card.link.blockId)}`;
      void navigate({ href });
    },
    [navigate],
  );

  useEffect(() => {
    return registerBoardController({
      addStoryline() {
        if (data.canEdit) setAddingStoryline(true);
      },
      addCard() {
        if (!data.canEdit) return;
        const selected = data.cards.find((c) => c.id === selectedCardId);
        const storylineId = selected?.storylineId ?? data.storylines[0]?.id;
        const episodeId = selected?.episodeId ?? data.episodes[0]?.id;
        if (storylineId !== undefined && episodeId !== undefined) {
          setAddingCardCell({ storylineId, episodeId });
        }
      },
      linkScene() {
        if (!data.canEdit || selectedCardId === null) return;
        const card = data.cards.find((c) => c.id === selectedCardId);
        if (card === undefined) return;
        const episode = data.episodes.find((e) => e.id === card.episodeId);
        if (episode === undefined) return;
        if (episode.docIds.script === null) {
          messages.push(
            messageFor({
              kind: "command_unavailable",
              label: BOARD_WORDS.linkToScene,
              reason: BOARD_WORDS.needsScript(episode.number),
            }),
          );
          return;
        }
        setLinkingCardId(card.id);
      },
      moveCard(by) {
        if (!data.canEdit) return;
        const focusedId =
          document.activeElement?.getAttribute("data-board-card") ??
          selectedCardId;
        if (focusedId === null) return;
        const card = data.cards.find((c) => c.id === focusedId);
        if (card === undefined) return;
        const cell = cardsInCell(data.cards, card.storylineId, card.episodeId);
        const index = cell.findIndex((c) => c.id === card.id);
        if (index === -1) return;
        sortableRef.current?.move(
          card.id,
          cellKey(card.storylineId, card.episodeId),
          index + by,
        );
      },
    });
  }, [data, selectedCardId, messages]);

  if (data.lookup.status !== "ready") return null;

  const empty = data.storylines.length === 0 && !addingStoryline;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-chrome text-fg">
      <BoardTitleBar
        projectTitle={data.lookup.project.title}
        seasons={data.seasons}
        activeSeason={data.activeSeason}
        canEdit={data.canEdit}
        showViewOnly={data.accessReady && !data.canEdit && !data.accessRemoved}
        onBack={() => void navigate({ href: "/" })}
        onSeasonChange={(nextSeasonId) =>
          void navigate({
            href: `/p/${projectId}/board?season=${encodeURIComponent(nextSeasonId)}`,
            replace: true,
          })
        }
        onAddStoryline={() => setAddingStoryline(true)}
      />

      <div className="min-h-0 flex-1 overflow-auto bg-chrome p-6">
        {data.accessRemoved ? (
          <div className="max-w-content-wide pt-12 text-ui">
            <p>{DOCUMENT_WORDS.noAccess}</p>
          </div>
        ) : empty ? (
          <div
            data-tour="board"
            className="flex max-w-content-wide flex-col items-start gap-3 pt-12"
          >
            <p className="text-ui text-fg-muted">{BOARD_WORDS.empty}</p>
            {data.canEdit ? (
              <Button
                variant="outline"
                onClick={() => setAddingStoryline(true)}
              >
                <PlusIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="size-icon"
                />
                {BOARD_WORDS.addStoryline}
              </Button>
            ) : null}
          </div>
        ) : (
          <BoardGrid
            storylines={data.storylines}
            episodes={data.episodes}
            cards={data.cards}
            scenesByScript={scenesByScript}
            canEdit={data.canEdit}
            selectedCardId={selectedCardId}
            linkingCardId={linkingCardId}
            addingStoryline={addingStoryline}
            addingCardCell={addingCardCell}
            sortableRef={sortableRef}
            mutations={mutations}
            onSelectCard={setSelectedCardId}
            onLinkingCardChange={setLinkingCardId}
            onOpenCard={handleOpenCard}
            onCommitStoryline={(title) => {
              setAddingStoryline(false);
              mutations.commitStoryline(title);
            }}
            onCancelStoryline={() => setAddingStoryline(false)}
            onStartAddCard={(storylineId, episodeId) =>
              setAddingCardCell({ storylineId, episodeId })
            }
            onCommitAddCard={(storylineId, episodeId, text) => {
              setAddingCardCell(null);
              mutations.commitAddCard(storylineId, episodeId, text);
            }}
            onCancelAddCard={() => setAddingCardCell(null)}
          />
        )}
      </div>

      <BoardStatusBar />
    </div>
  );
}
