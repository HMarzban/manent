// A scene's row menu: Writer, in a script two or more people may write, and Progress; each choice is one undo step.
import { SCENE_PROGRESS } from "@manent/crdt";
import type { SceneProgress } from "@manent/crdt";
import {
  ASSIGNMENT_WORDS,
  Avatar,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@manent/ui";
import {
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  ClockIcon,
  UserRoundIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import {
  PROGRESS_NAMES,
  sceneWriterOf,
  setSceneProgress,
  setSceneWriter,
  useSceneAssignment,
  writerChoices,
} from "./scene-assignment.ts";

const PROGRESS_ICONS: Readonly<Record<SceneProgress, LucideIcon>> =
  Object.freeze({
    not_started: CircleIcon,
    drafting: ClockIcon,
    handed_in: CheckCircle2Icon,
  });

const isSceneProgress = (value: unknown): value is SceneProgress =>
  SCENE_PROGRESS.some((progress) => progress === value);

const isUserIdOrNone = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** Read-only for a person who cannot edit: the choices show the scene's state and change nothing. */
export function AssignmentRowItems(props: {
  docId: string;
  headingId: string;
}): ReactNode {
  const { docId, headingId } = props;
  const assignment = useSceneAssignment(docId);
  const editable = useCanEdit(docId);
  return (
    <>
      {assignment.people.length < 2 ? null : (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-ui">
            <UserRoundIcon
              aria-hidden="true"
              className="size-icon text-fg-muted"
            />
            {ASSIGNMENT_WORDS.writer}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={sceneWriterOf(assignment, headingId)?.userId ?? null}
              onValueChange={(userId: unknown) => {
                if (isUserIdOrNone(userId))
                  setSceneWriter(docId, headingId, userId);
              }}
              disabled={!editable}
            >
              {writerChoices(assignment.people).map((choice) => (
                <DropdownMenuRadioItem
                  key={choice.value ?? ""}
                  value={choice.value}
                  closeOnClick
                  className="text-ui"
                >
                  {choice.value === null ? null : (
                    <Avatar
                      name={choice.label}
                      initials={initialsOf(choice.label)}
                      colour={null}
                      size="sm"
                      decorative
                    />
                  )}
                  {choice.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-ui">
          <CircleDotIcon
            aria-hidden="true"
            className="size-icon text-fg-muted"
          />
          {ASSIGNMENT_WORDS.progress}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={assignment.progress.get(headingId) ?? "not_started"}
            onValueChange={(progress: unknown) => {
              if (isSceneProgress(progress))
                setSceneProgress(docId, headingId, progress);
            }}
            disabled={!editable}
          >
            {SCENE_PROGRESS.map((progress) => {
              const Icon = PROGRESS_ICONS[progress];
              return (
                <DropdownMenuRadioItem
                  key={progress}
                  value={progress}
                  closeOnClick
                  className="text-ui"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-icon text-fg-muted"
                  />
                  {PROGRESS_NAMES[progress]}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
