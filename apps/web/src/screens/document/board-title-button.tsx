// Contextual Board button in the script title bar for Series episodes: zero chrome on non-series projects.
import {
  BOARD_WORDS,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSubscribable,
} from "@manent/ui";
import { useRouter } from "@tanstack/react-router";
import { Columns3Icon } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";

/**
 * Quiet ghost trigger directly before History on Series episode scripts, navigating to `/p/${projectId}/board`.
 * Returns null on Film, Book, Game, Stage, Show, News, and Podcast scripts so standard scripts gain zero chrome.
 */
export function BoardTitleButton(props: { readonly docId: string }): ReactNode {
  const { docId } = props;
  const { library } = useServices();
  const router = useRouter();
  const kindSource = useMemo(
    () => library.documentKind(docId),
    [library, docId],
  );
  const projectSource = useMemo(
    () => library.documentProject(docId),
    [library, docId],
  );
  const projectKind = useSubscribable(kindSource);
  const projectId = useSubscribable(projectSource);
  if (projectKind !== "series" || projectId === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            data-tour="title:board"
            className="h-control cursor-pointer gap-1.5 px-2 text-ui font-medium text-fg-muted hover:bg-subtle hover:text-fg @max-2xl:w-control @max-2xl:px-0"
            onClick={() =>
              void router.navigate({ href: `/p/${projectId}/board` })
            }
          />
        }
      >
        <Columns3Icon aria-hidden="true" className="size-icon shrink-0" />
        <span className="@max-2xl:sr-only">{BOARD_WORDS.board}</span>
      </TooltipTrigger>
      <TooltipContent>{BOARD_WORDS.board}</TooltipContent>
    </Tooltip>
  );
}
