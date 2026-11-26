// Elevated empty-state hero card for full screens and compact side panels.
import { cn } from "@manent/ui";
import type { ReactNode } from "react";

export interface EmptyHeroCardProps {
  icon: ReactNode;
  title?: string | null;
  headingAs?: "h1" | "h2" | "p";
  headingTabIndex?: number;
  description?: string | null;
  descriptionRole?: "alert";
  actions?: ReactNode;
  compact?: boolean;
}

/** Empty-state hero card with an icon medallion, optional title and description, and optional actions. */
export function EmptyHeroCard(props: EmptyHeroCardProps): ReactNode {
  const {
    icon,
    title = null,
    headingAs = "p",
    headingTabIndex,
    description = null,
    descriptionRole,
    actions = null,
    compact = false,
  } = props;
  const Heading = headingAs;
  return (
    <div
      className={
        compact
          ? "flex w-full flex-col items-center gap-2.5 rounded-surface border border-line bg-raised px-4 py-6 text-center animate-in fade-in-0 duration-(--dur-fast) ease-out"
          : "mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-surface border border-line bg-raised px-6 py-8 text-center animate-in fade-in-0 duration-(--dur-fast) ease-out"
      }
    >
      <div
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full border border-line bg-subtle text-fg-muted",
          compact ? "size-10" : "size-12",
        )}
      >
        {icon}
      </div>
      {title === null || title === "" ? null : (
        <Heading
          tabIndex={headingTabIndex}
          className={cn(
            compact
              ? "text-ui font-semibold text-fg"
              : "text-title font-semibold text-fg",
            headingTabIndex !== undefined && "outline-none",
          )}
        >
          {title}
        </Heading>
      )}
      {description === null || description === "" ? null : (
        <p
          role={descriptionRole}
          className={
            compact ? "text-ui text-fg-muted" : "max-w-sm text-ui text-fg-muted"
          }
        >
          {description}
        </p>
      )}
      {actions === null || actions === undefined || actions === false ? null : (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
