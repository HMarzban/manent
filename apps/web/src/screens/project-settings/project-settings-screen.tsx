// Project settings: unified left-rail settings shell across Format and style, Names and facts, People, Drafts, and Templates.
import { readEpisodes } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { DEMO_PEOPLE } from "@manent/demo";
import { SETTINGS } from "@manent/settings";
import type { ProjectGroup, SettingKey } from "@manent/settings";
import {
  PROJECT_WORDS,
  SEND_WORDS,
  SHOW_TEMPLATE_WORDS,
  SettingRow,
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
import { PROJECT_SETTING_ROWS } from "./project-setting-rows.ts";
import { createProjectStore } from "./project-store.ts";

const route = getRouteApi("/p/$projectId/settings");

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

const FORMAT_KEYS = Object.freeze(keysOf("format_style"));
const DRAFT_KEYS = Object.freeze(keysOf("drafts"));

const HEADER_FOOTER_KEYS: ReadonlySet<SettingKey> = new Set([
  "project.header",
  "project.footer",
]);

const STANDALONE_CARD_KEYS: ReadonlySet<SettingKey> = new Set([
  "project.style",
  "project.titlePage",
]);

/** How many of the project's episodes have their page numbers locked, of how many. */
const lockCount = (doc: CrdtDoc): { locked: number; total: number } => {
  const episodes = [...readEpisodes(doc).values()];
  return {
    locked: episodes.filter((episode) => episode.locked).length,
    total: episodes.length,
  };
};

/** One setting row inside a card: a custom feature row, else SettingRow with card-row padding. */
function ProjectRow(props: {
  settingKey: SettingKey;
  projectId: string;
}): ReactNode {
  const { settingKey, projectId } = props;
  const own = PROJECT_SETTING_ROWS.find((row) => row.settingKey === settingKey);
  if (own !== undefined) {
    if (HEADER_FOOTER_KEYS.has(settingKey)) {
      return (
        <div className="px-4 py-3">
          <own.Row settingKey={settingKey} projectId={projectId} />
        </div>
      );
    }
    return <own.Row settingKey={settingKey} projectId={projectId} />;
  }
  return (
    <SettingRow cardRow settingKey={settingKey} deviceName={null} persisted />
  );
}

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

/** Organises Format and style cleanly into calm sibling cards: Template, Element style, Title page, Header & footer, and defaults. */
function FormatAndStyleCards(props: { projectId: string }): ReactNode {
  const { projectId } = props;
  const templateKey = FORMAT_KEYS.find((k) => k === "project.template");
  const styleKey = FORMAT_KEYS.find((k) => k === "project.style");
  const titlePageKey = FORMAT_KEYS.find((k) => k === "project.titlePage");
  const headerFooterKeys = FORMAT_KEYS.filter((k) => HEADER_FOOTER_KEYS.has(k));
  const otherKeys = FORMAT_KEYS.filter(
    (k) =>
      k !== "project.template" &&
      !STANDALONE_CARD_KEYS.has(k) &&
      !HEADER_FOOTER_KEYS.has(k),
  );
  return (
    <>
      {templateKey === undefined ? null : (
        <SettingsCard divided>
          <ProjectRow settingKey={templateKey} projectId={projectId} />
        </SettingsCard>
      )}
      {styleKey === undefined ? null : (
        <ProjectRow settingKey={styleKey} projectId={projectId} />
      )}
      {titlePageKey === undefined ? null : (
        <ProjectRow settingKey={titlePageKey} projectId={projectId} />
      )}
      {headerFooterKeys.length === 0 ? null : (
        <SettingsCard divided>
          {headerFooterKeys.map((key) => (
            <ProjectRow key={key} settingKey={key} projectId={projectId} />
          ))}
        </SettingsCard>
      )}
      {otherKeys.length === 0 ? null : (
        <SettingsCard divided>
          {otherKeys.map((key) => (
            <ProjectRow key={key} settingKey={key} projectId={projectId} />
          ))}
        </SettingsCard>
      )}
    </>
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
  const { guard } = useEnvironment();
  const navigate = useNavigate();
  const placeName = usePlaceName(from);
  const index = useProjectIndex(projectId);
  const project = useProjectItem(projectId);
  const { access, people } = useProjectAccess(projectId);
  const locks = useIndexRead(index, "episodes", lockCount);
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
  const showTemplates = project !== null && isTemplateProjectKind(project.kind);
  const activeSection: ProjectSection =
    section === "templates" && !showTemplates ? "format_style" : section;
  const navItems = useMemo(() => buildNavItems(showTemplates), [showTemplates]);

  useEffect(() => {
    focusHeading(document);
  }, []);
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === services.userId);
    document.title = pageTitle(PROJECT_WORDS.heading, person?.name ?? null);
  }, [services.userId]);

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
            <FormatAndStyleCards projectId={projectId} />
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
                <ProjectRow key={key} settingKey={key} projectId={projectId} />
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
