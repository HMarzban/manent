// New project: one card per kind, in two rows of four; choosing one creates the project and opens its first document.
import { DEFAULT_FORMAT_PALETTES } from "@manent/settings";
import type { FormatPaletteKey, StudioPaletteId } from "@manent/settings";
import {
  APPEARANCE_STUDIO_WORDS,
  Button,
  CommandButton,
  HiddenGemIcon,
  LIBRARY_WORDS,
  NEW_PROJECT_CARDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RUNDOWN_WORDS,
  STUDIO_PALETTES,
  useCommandState,
  useSetting,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { localIsoDate } from "../../rundown/create-rundown.ts";
import { formatAirDate } from "../../rundown/dur-format.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectKind } from "../../services/ports.ts";
import { dialogActions, useOpenDialog } from "../../state/dialog.store.ts";
import { KindIcon } from "./project-kind.tsx";

const SURFACE = "new_project";
const DEFAULT_COLUMNS = 4;

function gridColumnCount(grid: HTMLElement, fallback: number): number {
  const view = grid.ownerDocument.defaultView;
  if (view === null || typeof view.getComputedStyle !== "function")
    return fallback;
  const cols = view
    .getComputedStyle(grid)
    .gridTemplateColumns.trim()
    .split(/\s+/)
    .filter((token) => token !== "" && token !== "none").length;
  return cols > 0 ? cols : fallback;
}

const moveBetweenCards = (event: KeyboardEvent<HTMLElement>): void => {
  const cards = [...event.currentTarget.querySelectorAll("button")];
  if (cards.length === 0) return;
  if (event.key === "Home") {
    event.preventDefault();
    cards[0]?.focus();
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    cards.at(-1)?.focus();
    return;
  }
  const columns = gridColumnCount(event.currentTarget, DEFAULT_COLUMNS);
  let step: number | undefined;
  if (event.key === "ArrowRight") step = 1;
  else if (event.key === "ArrowLeft") step = -1;
  else if (event.key === "ArrowDown") step = columns;
  else if (event.key === "ArrowUp") step = -columns;
  if (step === undefined) return;
  const target = cards.find((card) => card === event.target);
  const next =
    target === undefined ? undefined : cards[cards.indexOf(target) + step];
  if (next === undefined) return;
  event.preventDefault();
  next.focus();
};

/**
 * The header's New project button and its popover, which is open while the dialog store holds `new_project`, however
 * it was opened. The cards are disabled while `workspaceId` is null, until the workspace shown is known. While the
 * command cannot run, the button is the command's own, which says why.
 */
const KIND_TO_FORMAT_KEY: Readonly<Record<ProjectKind, FormatPaletteKey>> =
  Object.freeze({
    film: "screenplay",
    series: "multicam",
    stage_play: "stage",
    book: "manuscript",
    podcast: "variety",
    game: "game",
    show: "show",
    news: "news",
  });

function paletteNameFor(id: StudioPaletteId): string {
  return (
    STUDIO_PALETTES.find((p) => p.id === id)?.name ?? STUDIO_PALETTES[0]!.name
  );
}

export function NewProjectPopover(props: {
  workspaceId: string | null;
}): ReactNode {
  const { workspaceId } = props;
  const { library, commands, messages } = useServices();
  const { dom, now } = useEnvironment();
  const autoByFormat = useSetting("appearance.autoByFormat");
  const formatPalettes = useSetting("appearance.formatPalettes");
  const gems = useSetting("appearance.gems");
  const navigate = useNavigate();
  const id = useId();
  const open = useOpenDialog() === SURFACE;
  const [creating, setCreating] = useState(false);
  const unavailable = useCommandState("library.newProject").whyNot !== null;

  const onOpenChange = (next: boolean): void => {
    if (next) {
      commands.run("library.newProject", "control");
      return;
    }
    dialogActions.close();
    dom.restoreFocus();
  };
  const create = async (workspace: string, kind: ProjectKind) => {
    setCreating(true);
    try {
      const { docId } = await library.createProject(workspace, kind);
      if (kind === "show" || kind === "news") {
        const nowMs = now();
        const dateLabel = formatAirDate(localIsoDate(nowMs), nowMs);
        if (dateLabel !== "") {
          messages.push({
            id: `rundown.new.${nowMs}.${docId}`,
            text: RUNDOWN_WORDS.newRundownFor(dateLabel),
            lifetime: "brief",
            ownWork: false,
            actions: [],
          });
        }
      }
      dialogActions.close();
      void navigate({ href: `/s/${docId}` });
    } finally {
      setCreating(false);
    }
  };

  if (unavailable)
    return <CommandButton id="library.newProject" variant="outline" />;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        data-tour="library.newProject"
        render={<Button variant="outline" />}
      >
        {LIBRARY_WORDS.newProject}
      </PopoverTrigger>
      {/* focus goes back to whatever opened it, which may be the empty list's button */}
      <PopoverContent
        finalFocus={false}
        align="end"
        className="w-auto max-w-(--available-width)"
      >
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          onKeyDown={moveBetweenCards}
        >
          {NEW_PROJECT_CARDS.map((card) => (
            <button
              key={card.kind}
              type="button"
              aria-labelledby={`${id}-${card.kind}`}
              aria-describedby={`${id}-${card.kind}-line`}
              disabled={creating || workspaceId === null}
              onClick={() => {
                if (workspaceId !== null) void create(workspaceId, card.kind);
              }}
              className="mn-card flex w-36 max-w-full min-w-0 flex-col items-start gap-1 p-3 text-start disabled:text-fg-disabled"
            >
              <span className="flex items-center gap-2">
                <KindIcon
                  kind={card.kind}
                  className="size-icon-lg text-fg-muted"
                />
                <span id={`${id}-${card.kind}`} className="text-ui font-medium">
                  {card.label}
                </span>
              </span>
              <span
                id={`${id}-${card.kind}-line`}
                className="text-meta text-fg-muted"
              >
                {card.description}
              </span>
              {autoByFormat ? (
                <span className="mt-1 flex items-center gap-1 text-micro text-fg-accent">
                  {gems ? (
                    <HiddenGemIcon
                      palette={
                        (formatPalettes[KIND_TO_FORMAT_KEY[card.kind]] as
                          StudioPaletteId | undefined) ??
                        DEFAULT_FORMAT_PALETTES[KIND_TO_FORMAT_KEY[card.kind]]
                      }
                      className="size-icon shrink-0"
                    />
                  ) : null}
                  <span className="truncate">
                    {APPEARANCE_STUDIO_WORDS.newProjectThemeHint(
                      paletteNameFor(
                        (formatPalettes[KIND_TO_FORMAT_KEY[card.kind]] as
                          StudioPaletteId | undefined) ??
                          DEFAULT_FORMAT_PALETTES[
                            KIND_TO_FORMAT_KEY[card.kind]
                          ],
                      ),
                    )}
                  </span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
