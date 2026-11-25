// What a search of the Library finds: the workspace's projects whose names hold it.
import { LIBRARY_WORDS, Skeleton, cn } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { useLibraryAddress } from "./library-address.ts";
import { ProjectList } from "./project-list.tsx";
import { LibraryViewSection } from "./view-section.tsx";
import type { LibraryViewProps } from "./views.ts";

const PLACEHOLDER_ROWS = ["w-48", "w-36", "w-56", "w-44"] as const;

/** The projects are listed once the workspace is known; before that a placeholder table holds their place. */
export function SearchResults(props: LibraryViewProps): ReactNode {
  const { workspaceId, projects } = props;
  const { where, now } = useEnvironment();
  const navigate = useNavigate();
  const query = useLibraryAddress().q?.trim() ?? "";
  const sought = query.toLocaleLowerCase();
  const found = projects.filter((project) =>
    project.title.toLocaleLowerCase().includes(sought),
  );
  const loading = workspaceId === null;
  const none = !loading && found.length === 0;
  return (
    <LibraryViewSection
      heading={LIBRARY_WORDS.searchHeading(query)}
      sentence={none ? LIBRARY_WORDS.searchNone(query) : null}
    >
      {loading ? (
        <div aria-busy="true" className="mn-table flex flex-col">
          <div aria-hidden="true" className="flex flex-col">
            <div className="mn-table-head flex items-center gap-3 px-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ms-auto hidden h-3 w-16 @lg:block" />
              <Skeleton className="ms-auto h-3 w-16 @lg:ms-0" />
            </div>
            {PLACEHOLDER_ROWS.map((width, index) => (
              <div
                key={index}
                className={cn(
                  "flex min-h-row items-center gap-3 px-3",
                  index > 0 ? "border-t border-line" : undefined,
                )}
              >
                <Skeleton className="size-icon shrink-0" />
                <div className="min-w-0 flex-1">
                  <Skeleton className={cn("h-3.5 max-w-full", width)} />
                </div>
                <Skeleton className="ms-auto hidden h-3 w-20 shrink-0 @lg:block" />
                <Skeleton className="ms-auto h-3.5 w-16 shrink-0 @lg:ms-0" />
              </div>
            ))}
          </div>
        </div>
      ) : found.length === 0 ? null : (
        <ProjectList
          projects={found}
          shell={where.shell}
          now={now()}
          open={(docId) => void navigate({ href: `/s/${docId}` })}
        />
      )}
    </LibraryViewSection>
  );
}
