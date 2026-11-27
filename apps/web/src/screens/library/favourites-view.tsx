// Favourites view: starred projects first under Projects, then starred scripts under Scripts, omitting trashed documents.
import {
  LIBRARY_FILES_WORDS,
  Row,
  createValue,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectKind } from "../../services/ports.ts";
import type { FavouriteEntry } from "../../services/sync/favourites.ts";
import type { DocumentEntry } from "../../services/sync/index-entries.ts";
import { DOCUMENT_ROW_ITEMS } from "./document-row-items.ts";
import { LibraryViewHeader } from "./library-view-header.tsx";
import { KindIcon, kindLabel } from "./project-kind.tsx";
import { ProjectList } from "./project-list.tsx";
import { RowContextMenu, RowMenu } from "./row-place.tsx";
import type { LibraryViewProps } from "./views.ts";

const EMPTY_FAVS: Subscribable<readonly FavouriteEntry[]> = createValue([]);
const EMPTY_DOCS: Subscribable<ReadonlyMap<string, DocumentEntry>> =
  createValue(new Map());

interface FavouriteDocRow {
  readonly docId: string;
  readonly title: string;
  readonly meta: string;
  readonly kind: ProjectKind;
}

export function FavouritesView(props: LibraryViewProps): ReactNode {
  const { workspaceId, continueList, projects } = props;
  const { userId, favourites, folders } = useServices();
  const { where, now } = useEnvironment();
  const navigate = useNavigate();

  const favSource = useMemo(
    () =>
      workspaceId === null ? EMPTY_FAVS : favourites.list(userId, workspaceId),
    [favourites, userId, workspaceId],
  );
  const docsSource = useMemo(
    () => (workspaceId === null ? EMPTY_DOCS : folders.documents(workspaceId)),
    [folders, workspaceId],
  );
  const favEntries = useSubscribable(favSource);
  const docs = useSubscribable(docsSource);

  const favProjectIds = useMemo(
    () =>
      new Set(
        favEntries
          .filter((entry) => entry.kind === "project")
          .map((entry) => entry.id),
      ),
    [favEntries],
  );
  const favProjects = useMemo(
    () => projects.filter((project) => favProjectIds.has(project.projectId)),
    [projects, favProjectIds],
  );

  const favDocs = useMemo<FavouriteDocRow[]>(() => {
    const projectsById = new Map(projects.map((p) => [p.projectId, p]));
    const continueById = new Map(continueList.map((c) => [c.docId, c]));
    return favEntries
      .filter((entry) => entry.kind === "document")
      .flatMap((entry): FavouriteDocRow[] => {
        const doc = docs.get(entry.id);
        if (doc !== undefined) {
          if (doc.trashedAt !== null) return [];
          const project = projectsById.get(doc.projectId);
          const kind: ProjectKind = project?.kind ?? "film";
          const label = kindLabel(kind);
          const meta =
            project === undefined || project.title === doc.title
              ? label
              : [project.title, label].join(" · ");
          return [{ docId: entry.id, title: doc.title, meta, kind }];
        }
        const continued = continueById.get(entry.id);
        if (continued === undefined) return [];
        const label = kindLabel(continued.kind);
        const meta =
          continued.projectTitle === continued.title
            ? label
            : [continued.projectTitle, label].join(" · ");
        return [
          {
            docId: continued.docId,
            title: continued.title,
            meta,
            kind: continued.kind,
          },
        ];
      });
  }, [favEntries, docs, projects, continueList]);

  const open = (docId: string): void => {
    void navigate({ href: `/s/${docId}` });
  };
  const empty = favProjects.length === 0 && favDocs.length === 0;

  return (
    <section
      aria-label={LIBRARY_FILES_WORDS.favouritesHeading}
      className="flex min-h-0 flex-1 flex-col gap-6"
    >
      {empty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center p-6">
            <EmptyHeroCard
              headingAs="h2"
              icon={<StarIcon aria-hidden="true" className="size-5" />}
              title={LIBRARY_FILES_WORDS.favouritesHeading}
              description={LIBRARY_FILES_WORDS.favouritesEmpty}
            />
          </div>
        </div>
      ) : (
        <LibraryViewHeader
          icon={<StarIcon aria-hidden="true" className="size-icon" />}
          title={LIBRARY_FILES_WORDS.favouritesHeading}
          subtitle={LIBRARY_FILES_WORDS.favouritesNote}
        />
      )}
      {favProjects.length > 0 ? (
        <div className="flex min-h-0 flex-col gap-2">
          <h3 className="mn-group-label">
            {LIBRARY_FILES_WORDS.favouritesProjects}
          </h3>
          <ProjectList
            projects={favProjects}
            shell={where.shell}
            now={now()}
            open={open}
          />
        </div>
      ) : null}
      {favDocs.length > 0 ? (
        <div className="flex min-h-0 flex-col gap-2">
          <h3 className="mn-group-label">
            {LIBRARY_FILES_WORDS.favouritesScripts}
          </h3>
          <div className="mn-table">
            {favDocs.map((doc) => {
              const entries =
                DOCUMENT_ROW_ITEMS.length === 0
                  ? null
                  : DOCUMENT_ROW_ITEMS.map(({ id, Item }) => (
                      <Item key={id} docId={doc.docId} />
                    ));
              const row = (
                <Row
                  leading={<KindIcon kind={doc.kind} />}
                  meta={doc.meta}
                  onActivate={() => open(doc.docId)}
                  menu={
                    entries === null ? undefined : (
                      <RowMenu title={doc.title}>{entries}</RowMenu>
                    )
                  }
                >
                  <span className="font-semibold">{doc.title}</span>
                </Row>
              );
              return entries === null ? (
                <div key={doc.docId}>{row}</div>
              ) : (
                <RowContextMenu key={doc.docId} entries={entries}>
                  {row}
                </RowContextMenu>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
