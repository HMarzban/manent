// What a search of the Library finds: the workspace's projects whose names hold it.
import { LIBRARY_WORDS } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { useLibraryAddress } from "./library-address.ts";
import { ProjectList } from "./project-list.tsx";
import { LibraryViewSection } from "./view-section.tsx";
import type { LibraryViewProps } from "./views.ts";

/** The projects are listed once the workspace is known; before that the heading stands alone. */
export function SearchResults(props: LibraryViewProps): ReactNode {
  const { workspaceId, projects } = props;
  const { where, now } = useEnvironment();
  const navigate = useNavigate();
  const query = useLibraryAddress().q?.trim() ?? "";
  const sought = query.toLocaleLowerCase();
  const found = projects.filter((project) =>
    project.title.toLocaleLowerCase().includes(sought),
  );
  const none = workspaceId !== null && found.length === 0;
  return (
    <LibraryViewSection
      heading={LIBRARY_WORDS.searchHeading(query)}
      sentence={none ? LIBRARY_WORDS.searchNone(query) : null}
    >
      {found.length === 0 ? null : (
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
