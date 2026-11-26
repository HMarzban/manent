// Project settings: what every script of a project shares, in four groups; only the owner changes Format and style,
// People and Drafts, and editors Names and facts. Every change applies at once and is said in the message slot.
import { readEpisodes } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { DEMO_PEOPLE } from "@manent/demo";
import { SETTINGS } from "@manent/settings";
import type { ProjectGroup, SettingKey } from "@manent/settings";
import {
  Button,
  MessageSlot,
  PROJECT_WORDS,
  SEND_WORDS,
  SettingRow,
  SettingsProvider,
  cn,
  createValue,
  useSubscribable,
} from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo } from "react";
import type { ReactNode } from "react";
import { createProjectSettingsBag } from "../../project/settings-bag.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import { CommandsButton } from "../../shell/commands-button.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import { focusHeading } from "../../focus.ts";
import { TemplatesGroup } from "../../templates/project-templates-panel.tsx";
import { isTemplateProjectKind } from "../../templates/template-service.ts";
import { TEXT, pageTitle } from "../../text.ts";
import { announcing } from "../document/setting-messages.ts";
import { isCommandId } from "../preferences/search-index.ts";
import { FactsList } from "./facts-list.tsx";
import { NamesGroup } from "./names-group.tsx";
import { PeopleGroup } from "./people-group.tsx";
import {
  useIndexRead,
  useProjectAccess,
  useProjectIndex,
  useProjectItem,
} from "./project-data.ts";
import { PROJECT_SETTING_ROWS } from "./project-setting-rows.ts";
import { createProjectStore } from "./project-store.ts";

const route = getRouteApi("/p/$projectId/settings");
const DOCUMENT_PATH = /^\/s\/([^/?#]+)/;

/** The settings `group` draws, in their order. */
const keysOf = (group: ProjectGroup): readonly SettingKey[] =>
  SETTINGS.all
    .flatMap((def) =>
      def.surfaces.flatMap((surface) =>
        surface.in === "projectSettings" && surface.group === group
          ? [{ key: def.key, order: surface.order }]
          : [],
      ),
    )
    .toSorted((a, b) => a.order - b.order)
    .map(({ key }) => key);

const GROUP_KEYS: Readonly<Record<ProjectGroup, readonly SettingKey[]>> =
  Object.freeze({
    format_style: keysOf("format_style"),
    names_facts: keysOf("names_facts"),
    people: keysOf("people"),
    drafts: keysOf("drafts"),
  });

/** How many of the project's episodes have their page numbers locked, of how many. */
const lockCount = (doc: CrdtDoc): { locked: number; total: number } => {
  const episodes = [...readEpisodes(doc).values()];
  return {
    locked: episodes.filter((episode) => episode.locked).length,
    total: episodes.length,
  };
};

/** The name of the place Back returns to: the document's title, or the Library. */
function usePlaceName(from: string): string {
  const { library } = useServices();
  const docId = DOCUMENT_PATH.exec(from)?.[1] ?? null;
  const title = useMemo(
    () =>
      docId === null
        ? createValue<string | null>(null)
        : library.documentTitle(docId),
    [library, docId],
  );
  return useSubscribable(title) ?? TEXT.libraryTitle;
}

/** The row drawn for `settingKey`: a feature's own, else the plain setting row. */
function Row(props: { settingKey: SettingKey; projectId: string }): ReactNode {
  const { settingKey, projectId } = props;
  const own = PROJECT_SETTING_ROWS.find((row) => row.settingKey === settingKey);
  if (own !== undefined)
    return <own.Row settingKey={settingKey} projectId={projectId} />;
  return <SettingRow settingKey={settingKey} deviceName={null} persisted />;
}

function Rows(props: { group: ProjectGroup; projectId: string }): ReactNode {
  return GROUP_KEYS[props.group].map((key) => (
    <Row key={key} settingKey={key} projectId={props.projectId} />
  ));
}

function Group(props: {
  group: ProjectGroup;
  /** Under the heading: the scope line, the locked line, the read-only line, as each applies. */
  lines: readonly (string | null)[];
  children: ReactNode;
}): ReactNode {
  const { group, lines, children } = props;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <h2 id={headingId} className="text-title">
        {PROJECT_WORDS.groups[group]}
      </h2>
      {lines.map((line) =>
        line === null ? null : (
          <p key={line} className="text-ui text-fg-muted">
            {line}
          </p>
        ),
      )}
      <div className="flex flex-col gap-2 pt-6">{children}</div>
    </section>
  );
}

/** The scope line and, while any episode is locked, how many are. */
function formatLines(
  project: ProjectItem | null,
  locks: { locked: number; total: number } | null,
): readonly (string | null)[] {
  if (project === null) return [];
  const { kind, title } = project;
  return [
    PROJECT_WORDS.scopeLine[kind](title),
    locks === null || locks.locked === 0
      ? null
      : PROJECT_WORDS.lockedLine(kind, locks.locked, locks.total),
  ];
}

/** The status bar of Project settings: its messages, and the palette. */
function StatusBar(): ReactNode {
  const { messages, commands } = useServices();
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-2 border-t border-line px-2"
    >
      <MessageSlot
        queue={messages}
        run={(id) => {
          if (isCommandId(id)) commands.run(id, "control");
        }}
        registered={isCommandId}
      />
      <CommandsButton />
    </ShellRegion>
  );
}

export function ProjectSettingsScreen(): ReactNode {
  const { projectId }: { projectId: string } = route.useParams();
  const { from }: { from: string } = route.useSearch();
  const services = useServices();
  const { guard } = useEnvironment();
  const navigate = useNavigate();
  const placeName = usePlaceName(from);
  const index = useProjectIndex(projectId);
  const project = useProjectItem(projectId);
  const { access, people } = useProjectAccess(projectId);
  const locks = useIndexRead(index, "episodes", lockCount);
  // until the server says otherwise, a change is offered, and the server refuses one it does not allow
  const owner = access?.owner ?? true;
  const editor = access?.editor ?? true;
  const bag = useMemo(() => createProjectSettingsBag({ index }), [index]);
  const store = useMemo(
    () =>
      announcing(
        createProjectStore({ bag, canChange: owner, guard }),
        services,
      ),
    [bag, owner, guard, services],
  );
  const ownerLine = owner ? null : PROJECT_WORDS.ownerOnly;

  useEffect(() => {
    focusHeading(document);
  }, []);
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === services.userId);
    document.title = pageTitle(PROJECT_WORDS.heading, person?.name ?? null);
  }, [services.userId]);
  return (
    <SettingsProvider store={store}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-titlebar shrink-0 items-center gap-2 border-b border-line px-2">
          <Button
            variant="ghost"
            className="text-fg-muted"
            onClick={() => void navigate({ href: from })}
          >
            {SEND_WORDS.back(placeName)}
          </Button>
          <h1 tabIndex={-1} className="truncate text-heading outline-none">
            {project === null
              ? PROJECT_WORDS.heading
              : `${project.title} · ${PROJECT_WORDS.heading}`}
          </h1>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div
            className={cn(
              "mx-auto flex w-full max-w-content flex-col gap-8",
              !owner &&
                "[&_[data-tour^='setting:']_button[data-slot='button'][disabled]]:hidden",
            )}
          >
            <Group
              group="format_style"
              lines={[
                ...formatLines(
                  project,
                  locks.kind === "ready" ? locks.value : null,
                ),
                ownerLine,
              ]}
            >
              <Rows group="format_style" projectId={projectId} />
            </Group>
            <Group
              group="names_facts"
              lines={[editor ? null : PROJECT_WORDS.editorsOnly]}
            >
              <NamesGroup />
              <FactsList />
            </Group>
            <Group group="people" lines={[ownerLine]}>
              <PeopleGroup
                index={index}
                projectId={projectId}
                people={people}
                canChange={owner}
              />
            </Group>
            <Group group="drafts" lines={[ownerLine]}>
              <Rows group="drafts" projectId={projectId} />
            </Group>
            {project !== null && isTemplateProjectKind(project.kind) ? (
              <TemplatesGroup
                index={index}
                projectId={projectId}
                projectKind={project.kind}
                canChangeDefaults={owner}
                canEditWorkspace={editor}
              />
            ) : null}
          </div>
        </div>
        <StatusBar />
      </div>
    </SettingsProvider>
  );
}
