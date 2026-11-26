// Project settings → Templates group: strictly for Show and News projects, with immediate Clear + Undo and in-place Remove confirmation.
import type {
  CrdtDoc,
  RundownTemplateSkeleton,
  ScriptTemplateSkeleton,
  TemplateKind,
  WorkspaceTemplateEntry,
} from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  Button,
  DIALOG_WORDS,
  LAYOUT_SETTINGS_WORDS,
  PROJECT_WORDS,
  SHARING_WORDS,
  SHOW_TEMPLATE_WORDS,
} from "@manent/ui";
import { QueryClientContext } from "@tanstack/react-query";
import { useCallback, useContext, useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectIndex } from "../project/project-index.ts";
import { useIndexRead } from "../screens/project-settings/project-data.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { ProjectKind } from "../services/ports.ts";
import { liveMap } from "../services/sync/private-index.ts";
import {
  clearProjectDefault,
  findProjectWorkspaceSync,
  isTemplateProjectKind,
  listWorkspaceTemplates,
  readProjectRundownDefault,
  readProjectScriptDefault,
  removeWorkspaceTemplate,
  writeProjectDefault,
} from "./template-service.ts";
import type { StoredProjectTemplate } from "./template-service.ts";

const WORDS = SHOW_TEMPLATE_WORDS;

interface ProjectDefaults {
  readonly rundown: StoredProjectTemplate<RundownTemplateSkeleton> | null;
  readonly script: StoredProjectTemplate<ScriptTemplateSkeleton> | null;
}

const readDefaults = (doc: CrdtDoc): ProjectDefaults => ({
  rundown: readProjectRundownDefault(doc, WORDS.defaultRundown),
  script: readProjectScriptDefault(doc, WORDS.defaultScript),
});

function DefaultRow(props: {
  readonly label: string;
  readonly value: string | null;
  readonly canChange: boolean;
  readonly onClear: () => void;
}): ReactNode {
  const { label, value, canChange, onClear } = props;
  return (
    <div className="flex min-h-row-2 items-center justify-between gap-3 border-t border-line px-3 py-2 first:border-t-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ui font-medium text-fg">{label}</span>
        <span className="truncate text-meta text-fg-muted">
          {value ?? WORDS.noneStartsBlank}
        </span>
      </div>
      {value !== null && canChange ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="shrink-0 cursor-pointer text-fg-muted hover:text-fg"
        >
          {WORDS.clear}
        </Button>
      ) : null}
    </div>
  );
}

function WorkspaceTemplateRow(props: {
  readonly entry: WorkspaceTemplateEntry;
  readonly canSetDefault: boolean;
  readonly canRemove: boolean;
  readonly onUseAsDefault: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  const { entry, canSetDefault, canRemove, onUseAsDefault, onRemove } = props;
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-2 border-t border-line bg-subtle px-3 py-2 first:border-t-0">
        <span className="text-ui font-medium text-fg">
          {WORDS.removeConfirm(entry.name)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
            className="cursor-pointer"
          >
            {DIALOG_WORDS.cancel}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirming(false);
              onRemove();
            }}
            className="cursor-pointer text-danger"
          >
            {SHARING_WORDS.remove}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-row-2 flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 first:border-t-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-ui font-medium text-fg">
          {entry.name}
        </span>
        <span className="text-meta text-fg-muted">
          {entry.kind === "rundown"
            ? WORDS.defaultRundown
            : WORDS.defaultScript}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canSetDefault ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUseAsDefault}
            className="cursor-pointer"
          >
            {WORDS.useAsProjectDefault}
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            className="cursor-pointer text-fg-muted hover:text-danger"
          >
            {SHARING_WORDS.remove}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Conditional `Templates` section for Show and News projects inside Project settings. */
export function TemplatesGroup(props: {
  readonly index: ProjectIndex;
  readonly projectId: string;
  readonly projectKind: ProjectKind;
  readonly canChangeDefaults: boolean;
  readonly canEditWorkspace: boolean;
  readonly workspaceId?: string | null;
  readonly workspaceName?: string | null;
}): ReactNode {
  const {
    index,
    projectId,
    projectKind,
    canChangeDefaults,
    canEditWorkspace,
    workspaceId: givenWsId,
    workspaceName: givenWsName,
  } = props;
  const services = useServices();
  const { now } = useEnvironment();
  const queries = useContext(QueryClientContext);
  const headingId = useId();
  const defaults = useIndexRead(index, "template", readDefaults);
  const [wsInfo, setWsInfo] = useState<{ id: string; name: string } | null>(
    givenWsId !== undefined && givenWsId !== null
      ? { id: givenWsId, name: givenWsName ?? givenWsId }
      : null,
  );
  const [wsTemplates, setWsTemplates] = useState<
    readonly WorkspaceTemplateEntry[]
  >([]);

  useEffect(() => {
    if (givenWsId !== undefined && givenWsId !== null) {
      setWsInfo({ id: givenWsId, name: givenWsName ?? givenWsId });
      return;
    }
    const cached =
      queries?.getQueryData<readonly WorkspaceRef[]>(["me", services.userId]) ??
      [];
    const syncHit = findProjectWorkspaceSync({
      library: services.library,
      userId: services.userId,
      projectId,
      workspaces: cached,
    });
    if (syncHit !== null) {
      setWsInfo({ id: syncHit.workspaceId, name: syncHit.workspaceName });
      return;
    }
    let shown = true;
    void services.api
      .me()
      .then((me) => {
        if (!shown) return;
        const workspaces = me.ok ? me.me.workspaces : [];
        const hit = findProjectWorkspaceSync({
          library: services.library,
          userId: services.userId,
          projectId,
          workspaces,
        });
        if (hit !== null)
          setWsInfo({ id: hit.workspaceId, name: hit.workspaceName });
      })
      .catch(() => {});
    return () => {
      shown = false;
    };
  }, [givenWsId, givenWsName, services, projectId, queries]);

  useEffect(() => {
    if (wsInfo === null) return;
    let shown = true;
    let stop = (): void => {};
    let handle: DocHandle | null = null;
    void services
      .openHandle(indexDocId("workspace", wsInfo.id))
      .then((opened) => {
        if (!shown) return void opened.close();
        handle = opened;
        const map = liveMap(opened, "templates");
        const refresh = (): void => {
          if (shown) setWsTemplates(listWorkspaceTemplates(opened.doc()));
        };
        refresh();
        stop = map.subscribe(refresh);
      })
      .catch(() => {});
    return () => {
      shown = false;
      stop();
      if (handle !== null) void handle.close();
    };
  }, [services, wsInfo]);

  const handleClear = useCallback(
    (kind: TemplateKind) => {
      if (defaults.kind !== "ready") return;
      const prior =
        kind === "rundown" ? defaults.value.rundown : defaults.value.script;
      if (prior === null) return;
      void index.handle().then((handle) => {
        clearProjectDefault(handle.doc(), kind);
        const messageId = `template.clear.${kind}.${now()}`;
        services.reverses.set(messageId, () => {
          void index.handle().then((h) => {
            writeProjectDefault(h.doc(), kind, prior);
          });
        });
        services.messages.push({
          id: messageId,
          text:
            kind === "rundown"
              ? WORDS.clearedDefaultRundown
              : WORDS.clearedDefaultScript,
          actions: [
            { label: LAYOUT_SETTINGS_WORDS.undo, commandId: "settings.undo" },
          ],
          lifetime: "reverse",
          ownWork: false,
        });
      });
    },
    [defaults, index, now, services],
  );

  const handleUseAsDefault = useCallback(
    (entry: WorkspaceTemplateEntry) => {
      void index.handle().then((handle) => {
        writeProjectDefault(handle.doc(), entry.kind, {
          name: entry.name,
          skeleton: entry.skeleton,
        });
        services.messages.push({
          id: `template.default.${entry.id}.${now()}`,
          text: WORDS.savedProjectDefault(entry.name),
          lifetime: "brief",
          ownWork: false,
          actions: [],
        });
      });
    },
    [index, now, services],
  );

  const handleRemoveWorkspace = useCallback(
    (entry: WorkspaceTemplateEntry) => {
      if (wsInfo === null) return;
      void services
        .openHandle(indexDocId("workspace", wsInfo.id))
        .then(async (handle) => {
          try {
            removeWorkspaceTemplate(handle.doc(), entry.id);
          } finally {
            await handle.close();
          }
        });
    },
    [services, wsInfo],
  );

  if (!isTemplateProjectKind(projectKind)) return null;

  const rundownName =
    defaults.kind === "ready" ? (defaults.value.rundown?.name ?? null) : null;
  const scriptName =
    defaults.kind === "ready" ? (defaults.value.script?.name ?? null) : null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <h2 id={headingId} className="text-title">
        {WORDS.heading}
      </h2>
      {canChangeDefaults ? null : (
        <p className="text-ui text-fg-muted">{PROJECT_WORDS.ownerOnly}</p>
      )}
      <div className="flex flex-col gap-4 pt-6">
        <div className="mn-table flex flex-col">
          <DefaultRow
            label={WORDS.defaultRundown}
            value={rundownName}
            canChange={canChangeDefaults}
            onClear={() => handleClear("rundown")}
          />
          <DefaultRow
            label={WORDS.defaultScript}
            value={scriptName}
            canChange={canChangeDefaults}
            onClear={() => handleClear("script")}
          />
        </div>
        {wsTemplates.length > 0 && wsInfo !== null ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-ui font-medium text-fg-muted">
              {WORDS.sharedInWorkspace(wsInfo.name)}
            </h3>
            <div className="mn-table flex flex-col">
              {wsTemplates.map((entry) => (
                <WorkspaceTemplateRow
                  key={entry.id}
                  entry={entry}
                  canSetDefault={canChangeDefaults}
                  canRemove={canEditWorkspace}
                  onUseAsDefault={() => handleUseAsDefault(entry)}
                  onRemove={() => handleRemoveWorkspace(entry)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
