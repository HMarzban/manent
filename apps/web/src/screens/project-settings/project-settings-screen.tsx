// Project settings: unified left-rail settings shell across Format and style, Names and facts, People, Drafts, and Templates.
import { readEpisodes } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import {
  PROJECT_WORDS,
  SEND_WORDS,
  SHOW_TEMPLATE_WORDS,
  SettingsProvider,
} from "@manent/ui";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  LayersIcon,
  LayoutTemplateIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useId, useMemo } from "react";
import type { ReactNode } from "react";
import { personTitleName } from "../../demo/demo-bridge.ts";
import { focusHeading } from "../../focus.ts";
import { createProjectSettingsBag } from "../../project/settings-bag.ts";
import type { ProjectSection } from "../../routes/project.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import {
  SettingsCard,
  SettingsNotice,
} from "../../settings-shell/settings-card.tsx";
import { SettingsShell } from "../../settings-shell/settings-shell.tsx";
import type { SettingsNavItem } from "../../settings-shell/settings-shell.tsx";
import { usePlaceName } from "../../settings-shell/use-place-name.ts";
import { TemplatesGroup } from "../../templates/project-templates-panel.tsx";
import { isTemplateProjectKind } from "../../templates/template-service.ts";
import { pageTitle } from "../../text.ts";
import { announcing } from "../document/setting-messages.ts";
import { FactsList } from "./facts-list.tsx";
import { NamesGroup } from "./names-group.tsx";
import { PeopleGroup } from "./people-group.tsx";
import {
  useIndexRead,
  useProjectAccess,
  useProjectIndex,
  useProjectItem,
} from "./project-data.ts";
import {
  FormatAndStyleCards,
  ProjectRow,
  projectGroupKeys,
} from "./project-format-cards.tsx";
import { createProjectStore } from "./project-store.ts";
import { useRemoteProjectSettingMessages } from "./remote-project-messages.ts";

const route = getRouteApi("/p/$projectId/settings");

const DRAFT_KEYS = Object.freeze(projectGroupKeys("drafts"));

/** How many of the project's episodes have their page numbers locked, of how many. */
const lockCount = (doc: CrdtDoc): { locked: number; total: number } => {
  const episodes = [...readEpisodes(doc).values()];
  return {
    locked: episodes.filter((episode) => episode.locked).length,
    total: episodes.length,
  };
};

function SectionFrame(props: {
  title: string;
  scope?: string | null;
  notices?: readonly { tone: "info" | "locked"; text: string }[];
  children: ReactNode;
}): ReactNode {
  const { title, scope, notices = [], children } = props;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-title">
            {title}
          </h2>
          {scope === undefined || scope === null ? null : (
            <p className="text-ui text-fg-muted">{scope}</p>
          )}
        </div>
        {notices.map((notice) => (
          <SettingsNotice key={notice.text} tone={notice.tone}>
            {notice.text}
          </SettingsNotice>
        ))}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function buildNavItems(
  showTemplates: boolean,
): readonly SettingsNavItem<ProjectSection>[] {
  const items: SettingsNavItem<ProjectSection>[] = [
    {
      id: "format_style",
      label: PROJECT_WORDS.groups.format_style,
      icon: <SlidersHorizontalIcon aria-hidden="true" />,
    },
    {
      id: "names_facts",
      label: PROJECT_WORDS.groups.names_facts,
      icon: <BookOpenIcon aria-hidden="true" />,
    },
    {
      id: "people",
      label: PROJECT_WORDS.groups.people,
      icon: <UsersIcon aria-hidden="true" />,
    },
    {
      id: "drafts",
      label: PROJECT_WORDS.groups.drafts,
      icon: <LayersIcon aria-hidden="true" />,
    },
  ];
  if (showTemplates) {
    items.push({
      id: "templates",
      label: SHOW_TEMPLATE_WORDS.heading,
      icon: <LayoutTemplateIcon aria-hidden="true" />,
    });
  }
  return items;
}

function formatNotices(
  project: ProjectItem | null,
  locks: { locked: number; total: number } | null,
  owner: boolean,
): { tone: "info" | "locked"; text: string }[] {
  const notices: { tone: "info" | "locked"; text: string }[] = [];
  if (project !== null && locks !== null && locks.locked > 0) {
    notices.push({
      tone: "info",
      text: PROJECT_WORDS.lockedLine(project.kind, locks.locked, locks.total),
    });
  }
  if (!owner) notices.push({ tone: "locked", text: PROJECT_WORDS.ownerOnly });
  return notices;
}

export function ProjectSettingsScreen(): ReactNode {
  const { projectId }: { projectId: string } = route.useParams();
  const { from, section }: { from: string; section: ProjectSection } =
    route.useSearch();
  const services = useServices();
  const { guard, now } = useEnvironment();
  const navigate = useNavigate();
  const placeName = usePlaceName(from);
  const index = useProjectIndex(projectId);
  const project = useProjectItem(projectId);
  const { access, people } = useProjectAccess(projectId);
  const locks = useIndexRead(index, "episodes", lockCount);
  const owner = access?.owner ?? true;
  const editor = access?.editor ?? true;
  const bag = useMemo(
    () => createProjectSettingsBag({ index, userId: services.userId, now }),
    [index, services.userId, now],
  );
  const store = useMemo(
    () =>
      announcing(
        createProjectStore({ bag, canChange: owner, guard }),
        services,
      ),
    [bag, owner, guard, services],
  );
  useRemoteProjectSettingMessages({
    bag,
    projectTitle: project?.title ?? null,
    projectKind: project?.kind ?? null,
    people,
    userId: services.userId,
    messages: services.messages,
  });
  const showTemplates = project !== null && isTemplateProjectKind(project.kind);
  const activeSection: ProjectSection =
    section === "templates" && !showTemplates ? "format_style" : section;
  const navItems = useMemo(() => buildNavItems(showTemplates), [showTemplates]);

  useEffect(() => {
    focusHeading(document);
  }, []);
  useEffect(() => {
    document.title = pageTitle(
      PROJECT_WORDS.heading,
      personTitleName(services.userId, services.personName),
    );
  }, [services.userId, services.personName]);

  const selectSection = (next: ProjectSection): void => {
    void navigate({
      href: `/p/${encodeURIComponent(projectId)}/settings?section=${next}&from=${encodeURIComponent(from)}`,
      replace: true,
    });
  };

  return (
    <SettingsProvider store={store}>
      <SettingsShell
        backLabel={SEND_WORDS.back(placeName)}
        backTitle={placeName}
        onBack={() => void navigate({ href: from })}
        title={
          project === null
            ? PROJECT_WORDS.heading
            : `${project.title} · ${PROJECT_WORDS.heading}`
        }
        navLabel={PROJECT_WORDS.heading}
        navMode="tabs"
        navItems={navItems}
        activeNavId={activeSection}
        onSelectNav={selectSection}
      >
        {activeSection === "format_style" ? (
          <SectionFrame
            title={PROJECT_WORDS.groups.format_style}
            scope={
              project === null
                ? null
                : PROJECT_WORDS.scopeLine[project.kind](project.title)
            }
            notices={formatNotices(
              project,
              locks.kind === "ready" ? locks.value : null,
              owner,
            )}
          >
            <FormatAndStyleCards projectId={projectId} people={people} />
          </SectionFrame>
        ) : activeSection === "names_facts" ? (
          <SectionFrame
            title={PROJECT_WORDS.groups.names_facts}
            notices={
              editor
                ? []
                : [{ tone: "locked", text: PROJECT_WORDS.editorsOnly }]
            }
          >
            <NamesGroup />
            <FactsList />
          </SectionFrame>
        ) : activeSection === "people" ? (
          <SectionFrame
            title={PROJECT_WORDS.groups.people}
            notices={
              owner ? [] : [{ tone: "locked", text: PROJECT_WORDS.ownerOnly }]
            }
          >
            <PeopleGroup
              index={index}
              projectId={projectId}
              people={people}
              canChange={owner}
            />
          </SectionFrame>
        ) : activeSection === "drafts" ? (
          <SectionFrame
            title={PROJECT_WORDS.groups.drafts}
            notices={
              owner ? [] : [{ tone: "locked", text: PROJECT_WORDS.ownerOnly }]
            }
          >
            <SettingsCard divided>
              {DRAFT_KEYS.map((key) => (
                <ProjectRow
                  key={key}
                  settingKey={key}
                  projectId={projectId}
                  people={people}
                />
              ))}
            </SettingsCard>
          </SectionFrame>
        ) : project !== null && isTemplateProjectKind(project.kind) ? (
          <TemplatesGroup
            index={index}
            projectId={projectId}
            projectKind={project.kind}
            canChangeDefaults={owner}
            canEditWorkspace={editor}
          />
        ) : null}
      </SettingsShell>
    </SettingsProvider>
  );
}
