// Shared archival view header for non-empty Library views (Favourites, Private, Folder, Trash).
import type { ReactNode } from "react";

export function LibraryViewHeader(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle?: string | null;
  readonly actions?: ReactNode;
}): ReactNode {
  const { icon, title, subtitle = null, actions } = props;
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control border border-line bg-raised text-fg-muted"
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-heading text-fg">{title}</h2>
          {subtitle === null || subtitle === "" ? null : (
            <p className="text-meta text-fg-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </header>
  );
}
