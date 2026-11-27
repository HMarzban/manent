// Person roster grid on Choose who you are: tactile archival cards with rail, avatar halo and enter arrow.
import type { SignInChoice } from "@manent/sync-protocol";
import { Avatar } from "@manent/ui";
import {
  ArrowRightIcon,
  ClapperboardIcon,
  FilePlus2Icon,
  LayersIcon,
  LoaderCircleIcon,
  MessageSquareQuoteIcon,
  PenLineIcon,
  RadioIcon,
  ScrollTextIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "../../initials.ts";
import { TEXT } from "../../text.ts";
import { CHOOSE_GRID_COMPACT, CHOOSE_GRID_SPLIT } from "./choose-skeleton.tsx";

function RoleIcon(props: { choice: SignInChoice }): ReactNode {
  const { userId, registered } = props.choice;
  const cls = "mn-choose-role-icon size-icon shrink-0";
  if (!registered) return <FilePlus2Icon aria-hidden="true" className={cls} />;
  switch (userId) {
    case "dana":
      return <ClapperboardIcon aria-hidden="true" className={cls} />;
    case "sam":
      return <PenLineIcon aria-hidden="true" className={cls} />;
    case "priya":
      return <LayersIcon aria-hidden="true" className={cls} />;
    case "leo":
      return <MessageSquareQuoteIcon aria-hidden="true" className={cls} />;
    case "ana":
      return <RadioIcon aria-hidden="true" className={cls} />;
    default:
      return <ScrollTextIcon aria-hidden="true" className={cls} />;
  }
}

export function PeopleGrid(props: {
  choices: readonly SignInChoice[];
  chosenUserId: string | null;
  spotlightUserId: string | null;
  pendingUserId: string | null;
  disabled: boolean;
  compact: boolean;
  onChoose(choice: SignInChoice): void;
  onSpotlight(userId: string | null): void;
}): ReactNode {
  const {
    choices,
    chosenUserId,
    spotlightUserId,
    pendingUserId,
    disabled,
    compact,
    onChoose,
    onSpotlight,
  } = props;

  return (
    <ul
      className={compact ? CHOOSE_GRID_COMPACT : CHOOSE_GRID_SPLIT}
      onMouseLeave={() => onSpotlight(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          onSpotlight(null);
      }}
    >
      {choices.map((choice) => {
        const chosen = chosenUserId === choice.userId;
        const pending = pendingUserId === choice.userId;
        const dimmed = pendingUserId !== null && !pending;
        const spotlight =
          spotlightUserId === choice.userId && pendingUserId === null;
        return (
          <li key={choice.userId} className="flex">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(choice)}
              onMouseEnter={() => onSpotlight(choice.userId)}
              onFocus={() => onSpotlight(choice.userId)}
              aria-current={chosen ? "true" : undefined}
              aria-busy={pending ? "true" : undefined}
              data-new={choice.registered ? undefined : ""}
              data-spotlight={spotlight ? "true" : undefined}
              data-pending={pending ? "true" : undefined}
              data-dimmed={dimmed ? "true" : undefined}
              className="mn-card mn-choose-card flex w-full items-start gap-3.5 p-4 text-start"
            >
              <span aria-hidden="true" className="mn-choose-rail" />
              <Avatar
                name={choice.name}
                initials={choice.registered ? initialsOf(choice.name) : null}
                colour={null}
                size="lg"
                decorative
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-title text-fg">
                    {choice.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <RoleIcon choice={choice} />
                    {pending ? (
                      <LoaderCircleIcon
                        aria-hidden="true"
                        className="size-icon shrink-0 animate-spin text-fg-accent"
                      />
                    ) : (
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="mn-choose-arrow size-icon shrink-0"
                      />
                    )}
                  </span>
                </span>
                <span className="mn-choose-role text-meta">
                  {choice.title}
                  {chosen && (
                    <span className="mn-tag ms-2 align-text-bottom">
                      {TEXT.chosen}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
