// Shared settings surface primitives: raised SettingsCard containers and calm SettingsNotice callouts.
import { cn } from "@manent/ui";
import {
  InfoIcon,
  LockIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";

export type SettingsNoticeTone = "info" | "locked" | "offline" | "alert";

/**
 * Raised card container for a logical group of settings controls or rows.
 * Never sets `role="group"` or `<h2>` so screen-level section heading and control-list contracts stay exact.
 */
export function SettingsCard(props: {
  title?: string;
  description?: string;
  badge?: ReactNode;
  action?: ReactNode;
  /** When true, separates direct children with hairline `divide-y divide-line` rows and uniform padding. */
  divided?: boolean;
  /** Render a `<section>` wrapper (useful when tests query a titled card as a section). */
  asSection?: boolean;
  "aria-label"?: string;
  "data-tour"?: string;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const {
    title,
    description,
    badge,
    action,
    divided = false,
    asSection = false,
    className,
    children,
  } = props;
  const headingId = useId();
  const hasHeader =
    title !== undefined || description !== undefined || action !== undefined;
  const content = (
    <>
      {hasHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {title === undefined ? null : (
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={headingId} className="text-ui font-semibold text-fg">
                  {title}
                </h3>
                {badge}
              </div>
            )}
            {description === undefined ? null : (
              <p className="text-meta text-fg-muted">{description}</p>
            )}
          </div>
          {action === undefined ? null : (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          )}
        </div>
      ) : null}
      <div
        className={cn(
          divided ? "flex flex-col divide-y divide-line" : "flex flex-col p-4",
        )}
      >
        {children}
      </div>
    </>
  );
  const frameClass = cn(
    "overflow-hidden rounded-surface border border-line bg-raised",
    className,
  );
  if (asSection) {
    return (
      <section
        aria-label={props["aria-label"]}
        aria-labelledby={
          props["aria-label"] === undefined && title !== undefined
            ? headingId
            : undefined
        }
        data-tour={props["data-tour"]}
        className={frameClass}
      >
        {content}
      </section>
    );
  }
  return (
    <div data-tour={props["data-tour"]} className={frameClass}>
      {content}
    </div>
  );
}

/** Calm inline callout for permission gates, locked-episode counts, offline status, or load refusals. */
export function SettingsNotice(props: {
  tone: SettingsNoticeTone;
  children: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}): ReactNode {
  const { tone, children, action, role, className } = props;
  const icon =
    tone === "locked" ? (
      <LockIcon
        aria-hidden="true"
        className="mt-0.5 size-icon shrink-0 text-fg-muted"
      />
    ) : tone === "offline" ? (
      <WifiOffIcon
        aria-hidden="true"
        className="mt-0.5 size-icon shrink-0 text-fg-muted"
      />
    ) : tone === "alert" ? (
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-0.5 size-icon shrink-0 text-attention"
      />
    ) : (
      <InfoIcon
        aria-hidden="true"
        className="mt-0.5 size-icon shrink-0 text-fg-muted"
      />
    );
  return (
    <div
      role={role}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-surface border border-line bg-subtle px-3.5 py-2.5 text-ui text-fg",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {icon}
        <p className="min-w-0 text-ui text-fg-muted">{children}</p>
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}
