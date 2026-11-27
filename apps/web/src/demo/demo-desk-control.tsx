// Desk switcher: switches person in place or launches a second companion window in one click.
import { DEMO_PEOPLE } from "@manent/demo";
import {
  Avatar,
  Button,
  DEMO_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@manent/ui";
import {
  CheckIcon,
  ChevronDownIcon,
  Columns2Icon,
  ExternalLinkIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import type { TabPerson } from "../session.ts";

export function DeskControl(props: {
  person: TabPerson;
  companion: (typeof DEMO_PEOPLE)[number];
  serverStopped: boolean;
  blockedWindowUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchInPlace: (userId: string) => void;
  onOpenSecondWindow: () => void;
  onDismissBlocked: () => void;
  onAllPeople: () => void;
}): ReactNode {
  const {
    person,
    companion,
    serverStopped,
    blockedWindowUrl,
    open,
    onOpenChange,
    onSwitchInPlace,
    onOpenSecondWindow,
    onDismissBlocked,
    onAllPeople,
  } = props;

  const triggerButton = (
    <Button
      variant="ghost"
      size="sm"
      data-tour="demo:person"
      aria-label={DEMO_WORDS.person(person.name)}
      onClick={serverStopped ? onAllPeople : undefined}
      className="h-7 rounded-full px-1.5 font-medium sm:px-2"
    >
      <Avatar
        name={person.name}
        initials={initialsOf(person.name)}
        colour={null}
        size="sm"
        decorative
      />
      <span className="hidden sm:inline">{person.name}</span>
      {!serverStopped ? (
        <ChevronDownIcon
          aria-hidden="true"
          className="hidden size-3 text-fg-muted sm:inline"
        />
      ) : null}
    </Button>
  );

  // While the server is stopped, jump straight to Choose so unreachable messaging stays identical.
  if (serverStopped) return triggerButton;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={triggerButton} />
      <PopoverContent
        data-surface="demo"
        align="start"
        className="w-76 max-w-[calc(100vw-1.5rem)] p-3.5 data-closed:hidden"
      >
        <div className="flex flex-col gap-3 text-ui">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-fg">
              {DEMO_WORDS.switchDesk}
            </span>
            <span className="text-micro text-fg-muted">
              {DEMO_WORDS.scopeWindowHint}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            {DEMO_PEOPLE.map((candidate) => {
              const current = candidate.userId === person.userId;
              return (
                <button
                  key={candidate.userId}
                  type="button"
                  onClick={() => onSwitchInPlace(candidate.userId)}
                  className={
                    current
                      ? "flex w-full cursor-pointer items-center justify-between gap-2 rounded-control bg-selected px-2 py-1.5 text-start font-medium text-fg"
                      : "flex w-full cursor-pointer items-center justify-between gap-2 rounded-control px-2 py-1.5 text-start text-fg hover:bg-subtle"
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar
                      name={candidate.name}
                      initials={initialsOf(candidate.name)}
                      colour={null}
                      size="sm"
                      decorative
                    />
                    <span className="min-w-0 truncate">{candidate.name}</span>
                  </span>
                  {current ? (
                    <CheckIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-fg-accent"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-2.5">
            <button
              type="button"
              onClick={onOpenSecondWindow}
              className="mn-demo-proof-card items-center"
            >
              <span aria-hidden="true" className="mn-demo-proof-icon">
                <Columns2Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">
                  {DEMO_WORDS.openSecondWindow(companion.name)}
                </span>
                <span className="block text-meta text-fg-muted">
                  {DEMO_WORDS.openSecondWindowHint}
                </span>
              </span>
              <ExternalLinkIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-fg-muted"
              />
            </button>
            {blockedWindowUrl !== null ? (
              <a
                href={blockedWindowUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onDismissBlocked}
                className="inline-flex items-center gap-1.5 px-2 text-meta font-medium text-attention underline underline-offset-2"
              >
                <ExternalLinkIcon
                  aria-hidden="true"
                  className="size-3 shrink-0"
                />
                <span>{DEMO_WORDS.openInNewTab}</span>
              </a>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-fg-muted"
              onClick={onAllPeople}
            >
              {DEMO_WORDS.allPeople}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
