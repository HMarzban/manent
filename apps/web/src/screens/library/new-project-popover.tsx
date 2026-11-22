// New project: one card per kind, in two rows of four; choosing one creates the project and opens its first document.
import {
  Button,
  LIBRARY_WORDS,
  NEW_PROJECT_CARDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectKind } from "../../services/ports.ts";
import { dialogActions, useOpenDialog } from "../../state/dialog.store.ts";
import { KindIcon } from "./project-kind.tsx";

const SURFACE = "new_project";
const COLUMNS = 4;
// how far each arrow moves through the cards
const STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: COLUMNS,
  ArrowUp: -COLUMNS,
};

const moveBetweenCards = (event: KeyboardEvent<HTMLElement>): void => {
  const step = STEPS[event.key];
  if (step === undefined) return;
  const cards = [...event.currentTarget.querySelectorAll("button")];
  const target = cards.find((card) => card === event.target);
  const next =
    target === undefined ? undefined : cards[cards.indexOf(target) + step];
  if (next === undefined) return;
  event.preventDefault();
  next.focus();
};

/**
 * The header's New project button and its popover, which is open while the dialog store holds `new_project`, however
 * it was opened. The cards are disabled while `workspaceId` is null, until the workspace shown is known.
 */
export function NewProjectPopover(props: {
  workspaceId: string | null;
}): ReactNode {
  const { workspaceId } = props;
  const { library, commands } = useServices();
  const { dom } = useEnvironment();
  const navigate = useNavigate();
  const id = useId();
  const open = useOpenDialog() === SURFACE;
  const [creating, setCreating] = useState(false);

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
    const { docId } = await library.createProject(workspace, kind);
    setCreating(false);
    dialogActions.close();
    void navigate({ href: `/s/${docId}` });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        data-tour="library.newProject"
        render={<Button variant="outline" />}
      >
        {LIBRARY_WORDS.newProject}
      </PopoverTrigger>
      {/* focus goes back to whatever opened it, which may be the empty list's button */}
      <PopoverContent finalFocus={false} align="end" className="w-auto">
        <div className="grid grid-cols-4 gap-2" onKeyDown={moveBetweenCards}>
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
              className="mn-card flex w-36 flex-col items-start gap-1 p-3 text-start disabled:text-fg-disabled"
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
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
