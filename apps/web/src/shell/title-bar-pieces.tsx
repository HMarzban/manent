// Shared top-bar building blocks: hairline divider, Back button with Lucide chevron, and universal PersonMenu avatar.
import {
  ACCOUNT_WORDS,
  Avatar,
  Button,
  CommandMenu,
  LIBRARY_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@manent/ui";
import { ChevronLeftIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { SignOutDialogHost } from "../account/sign-out-dialog.tsx";
import {
  useOptionalEnvironment,
  useOptionalServices,
  useServices,
} from "../services/context.tsx";
import { fullNameOf } from "../services/sync/index-entries.ts";

/** The first letter of the first two words of `name`: "Dana Reyes" is "DR". */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");

/** Quiet vertical hairline separating navigation/action clusters in a title bar. */
export function TitleBarDivider(props: {
  readonly className?: string;
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn("mx-0.5 h-4 w-px shrink-0 bg-line", props.className)}
    />
  );
}

/**
 * Shared title-bar Back button: renders a crisp Lucide chevron with subtle hover motion while preserving
 * existing accessible names (such as `"‹ Library"`) via an sr-only prefix when present.
 */
export function BackButton(props: {
  readonly label: string;
  readonly title?: string;
  readonly size?: "sm" | "default";
  readonly className?: string;
  readonly onClick: () => void;
}): ReactNode {
  const { label, title, size = "default", className, onClick } = props;
  const hasLeadingChevron = label.startsWith("‹ ");
  const visibleLabel = hasLeadingChevron ? label.slice(2) : label;
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      title={title}
      className={cn(
        "shrink-0 cursor-pointer gap-1 px-2 text-fg-muted hover:text-fg",
        className,
      )}
      onClick={onClick}
    >
      <ChevronLeftIcon
        aria-hidden="true"
        className="mn-back-icon size-icon shrink-0"
      />
      {hasLeadingChevron ? (
        <span className="sr-only">{label.slice(0, 2)}</span>
      ) : null}
      <span className="truncate">{visibleLabel}</span>
    </Button>
  );
}

/** The person's avatar menu: identity header, Preferences, Switch person (demo), and Sign out. */
export function PersonMenu(props: { readonly name?: string }): ReactNode {
  const services = useServices();
  const environment = useOptionalEnvironment();
  const [open, setOpen] = useState(false);
  const resolvedName =
    props.name ?? services.personName ?? fullNameOf(services.userId);
  const signedIn = services.personSignedIn ?? false;
  const statusLine = signedIn
    ? ACCOUNT_WORDS.signedIn
    : LIBRARY_WORDS.neverSynced(environment?.where.shell === "desktop");
  const initials = initialsOf(resolvedName);

  const header = (
    <div className="flex items-center gap-2.5 px-2.5 py-2">
      <Avatar
        name={resolvedName}
        initials={initials}
        colour={null}
        size="md"
        decorative
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-ui font-semibold text-fg">
          {resolvedName}
        </span>
        <span className="truncate text-meta text-fg-muted">{statusLine}</span>
      </div>
    </div>
  );

  const avatar = (
    <Tooltip disabled={open}>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Avatar
          name={resolvedName}
          initials={initials}
          colour={null}
          size="md"
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        {ACCOUNT_WORDS.personMenuHint(resolvedName)}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <>
      <CommandMenu
        menu="person"
        label={resolvedName}
        align="end"
        open={open}
        onOpenChange={setOpen}
        header={header}
        triggerClassName="mn-person-trigger"
        trigger={avatar}
      />
      <SignOutDialogHost />
    </>
  );
}

/**
 * Trailing profile/account anchor for every app title bar: renders a hairline divider + PersonMenu.
 * Returns null gracefully when mounted in a standalone component test outside ServicesProvider.
 */
export function TitleBarAccount(props: {
  readonly name?: string;
  readonly dividerClassName?: string;
}): ReactNode {
  const services = useOptionalServices();
  if (services === null) return null;
  return (
    <div
      data-tour="title:account"
      className="flex shrink-0 items-center gap-1.5"
    >
      <TitleBarDivider className={props.dividerClassName} />
      <PersonMenu name={props.name} />
    </div>
  );
}
