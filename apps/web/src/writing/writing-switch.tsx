// The Writing switch at the head of the people list, once someone else has access to the script: who sees what the
// person types, by audience, with the line under each choice saying what it means.
import type { CommandId } from "@manent/commands";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  WRITING_WORDS,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import {
  GlobeIcon,
  LockIcon,
  MessageSquareDiffIcon,
  PenLineIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { useServices } from "../services/context.tsx";
import { writingActions } from "../state/writing.store.ts";
import type { WritingPosition } from "../state/writing.store.ts";

const CHOICES: readonly {
  position: WritingPosition;
  commandId: CommandId;
  icon: LucideIcon;
}[] = [
  {
    position: "everyone",
    commandId: "writing.forEveryone",
    icon: GlobeIcon,
  },
  {
    position: "suggestions",
    commandId: "writing.asSuggestions",
    icon: MessageSquareDiffIcon,
  },
  {
    position: "private",
    commandId: "writing.privately",
    icon: LockIcon,
  },
];

/** One choice, left out while its command is not offered here (As suggestions once page numbers are locked). */
function Choice(props: {
  position: WritingPosition;
  commandId: CommandId;
  icon: LucideIcon;
}): ReactNode {
  const { commands } = useServices();
  const { visible, enabled, whyNot } = useCommandState(props.commandId);
  if (!visible) return null;
  const Icon = props.icon;
  return (
    <DropdownMenuRadioItem
      value={props.position}
      disabled={!enabled}
      title={!enabled && whyNot !== null ? whyNot : undefined}
      className="items-start text-ui"
      onClick={() => {
        if (enabled) void commands.run(props.commandId, "control");
      }}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-icon shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">
          {WRITING_WORDS.positions[props.position]}
        </span>
        <span className="text-meta text-fg-muted">
          {!enabled && whyNot !== null
            ? whyNot
            : WRITING_WORDS.positionLines[props.position]}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
}

/** Hidden until the server has said that someone else has a role on the script. */
export function WritingSwitch(props: { docId: string }): ReactNode {
  const { docId } = props;
  const position = useSubscribable(writingActions.writingPositionOf(docId));
  const readAccess = () => writingActions.access(docId) === true;
  const othersHaveAccess = useSyncExternalStore(
    writingActions.subscribe,
    readAccess,
    readAccess,
  );
  if (!othersHaveAccess) return null;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-ui" data-tour="writing_switch">
        <PenLineIcon aria-hidden="true" className="size-icon shrink-0" />
        {WRITING_WORDS.switchLabel(WRITING_WORDS.positions[position])}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        <DropdownMenuRadioGroup value={position}>
          {CHOICES.map((choice) => (
            <Choice key={choice.position} {...choice} />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
