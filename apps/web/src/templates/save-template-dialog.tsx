// Save template dialog for Show and News scripts and rundowns: saves as project default or shared in workspace, offline-first.
import type { TemplateKind } from "@manent/crdt";
import { indexDocId } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  Button,
  DIALOG_WORDS,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SHARING_WORDS,
  SHOW_TEMPLATE_WORDS,
  createValue,
  useSubscribable,
} from "@manent/ui";
import { QueryClientContext } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useContext, useEffect, useId, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { ProjectKind } from "../services/ports.ts";
import { dialogActions, useOpenDialog } from "../state/dialog.store.ts";
import {
  findProjectWorkspaceSync,
  isTemplateProjectKind,
  saveTemplate,
  stripHandleForTemplate,
} from "./template-service.ts";

const WORDS = SHOW_TEMPLATE_WORDS;
const DIALOG_ID = "save_template";

export interface SaveTemplateDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly docId: string;
  readonly docKind: TemplateKind;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly initialName: string;
  readonly canSaveProjectDefault?: boolean;
}

export function SaveTemplateDialog(props: SaveTemplateDialogProps): ReactNode {
  const {
    open,
    onClose,
    docId,
    docKind,
    projectId,
    projectTitle,
    workspaceId,
    workspaceName,
    initialName,
    canSaveProjectDefault = true,
  } = props;
  const services = useServices();
  const { now, randomId, dom } = useEnvironment();
  const [name, setName] = useState(initialName);
  const [scope, setScope] = useState<"project" | "workspace">(
    canSaveProjectDefault ? "project" : "workspace",
  );
  const [saving, setSaving] = useState(false);

  const nameId = useId();
  const scopeLabelId = useId();
  const projectOptId = useId();
  const workspaceOptId = useId();

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setScope(canSaveProjectDefault ? "project" : "workspace");
    setSaving(false);
  }, [open, initialName, canSaveProjectDefault]);

  const close = (): void => {
    onClose();
    dom.restoreFocus();
  };

  const trimmed = name.trim();
  const canSubmit = trimmed !== "" && !saving;

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    void (async () => {
      const handle = await services.openHandle(docId);
      try {
        const skeleton = stripHandleForTemplate(handle, docKind);
        await saveTemplate({
          services,
          scope,
          projectId,
          workspaceId,
          name: trimmed,
          kind: docKind,
          skeleton,
          now,
          newId: randomId,
        });
      } finally {
        await handle.close();
      }
      services.messages.push({
        id: `template.save.${now()}`,
        text:
          scope === "project"
            ? WORDS.savedProjectDefault(trimmed)
            : WORDS.savedInWorkspace(trimmed, workspaceName),
        lifetime: "brief",
        ownWork: false,
        actions: [],
      });
      close();
    })().finally(() => setSaving(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        data-surface="save_template_dialog"
        className="max-w-md gap-4 bg-chrome p-5 text-fg"
      >
        <div className="flex flex-col gap-1 pe-8">
          <DialogTitle className="text-heading">{WORDS.saveAction}</DialogTitle>
          <DialogDescription className="text-ui text-fg-muted">
            {docKind === "rundown"
              ? WORDS.rundownStripNote
              : WORDS.scriptStripNote}
          </DialogDescription>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId} className="text-ui font-medium text-fg">
              {WORDS.nameLabel}
            </Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <fieldset
            aria-labelledby={scopeLabelId}
            className="flex flex-col gap-2"
          >
            <legend id={scopeLabelId} className="text-ui font-medium text-fg">
              {WORDS.whereLabel}
            </legend>
            <RadioGroup
              value={scope}
              onValueChange={(value) => {
                if (value === "project" || value === "workspace")
                  setScope(value);
              }}
              className="flex flex-col gap-2"
            >
              {canSaveProjectDefault ? (
                <label
                  htmlFor={projectOptId}
                  className="flex cursor-pointer items-start gap-2.5 rounded-surface border border-line bg-raised p-3"
                >
                  <RadioGroupItem
                    id={projectOptId}
                    value="project"
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-ui font-medium text-fg">
                      {WORDS.projectDefault}
                    </span>
                    <span className="text-meta text-fg-muted">
                      {WORDS.projectDefaultHelp(projectTitle)}
                    </span>
                  </span>
                </label>
              ) : null}
              <label
                htmlFor={workspaceOptId}
                className="flex cursor-pointer items-start gap-2.5 rounded-surface border border-line bg-raised p-3"
              >
                <RadioGroupItem
                  id={workspaceOptId}
                  value="workspace"
                  className="mt-0.5"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-ui font-medium text-fg">
                    {WORDS.sharedInWorkspace(workspaceName)}
                  </span>
                  <span className="text-meta text-fg-muted">
                    {WORDS.sharedInWorkspaceHelp(workspaceName)}
                  </span>
                </span>
              </label>
            </RadioGroup>
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-line pt-3.5">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              className="cursor-pointer"
            >
              {DIALOG_WORDS.cancel}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className={canSubmit ? "cursor-pointer" : "cursor-not-allowed"}
            >
              {WORDS.saveAction}
            </Button>
          </div>
        </form>

        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={SHARING_WORDS.close}
              className="absolute top-3 right-3 cursor-pointer text-fg-muted hover:text-fg"
            />
          }
        >
          <XIcon aria-hidden="true" className="size-icon" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

const NO_STR = createValue<string | null>(null);
const NO_KIND = createValue<ProjectKind | null>(null);

/** Shell host that resolves active document context and mounts `SaveTemplateDialog` when opened. */
export function SaveTemplateHost(props: {
  readonly docId: string | null;
}): ReactNode {
  const { docId } = props;
  const open = useOpenDialog() === DIALOG_ID;
  const { api, library, userId } = useServices();
  const projectSub = useMemo(
    () => (docId === null ? NO_STR : library.documentProject(docId)),
    [library, docId],
  );
  const kindSub = useMemo(
    () => (docId === null ? NO_KIND : library.documentKind(docId)),
    [library, docId],
  );
  const titleSub = useMemo(
    () => (docId === null ? NO_STR : library.documentTitle(docId)),
    [library, docId],
  );
  const docKindSub = useMemo(
    () => (docId === null ? NO_STR : library.docKindOf(docId)),
    [library, docId],
  );
  const projectId = useSubscribable(projectSub);
  const projectKind = useSubscribable(kindSub);
  const title = useSubscribable(titleSub) ?? "";
  const rawDocKind = useSubscribable(docKindSub);

  const queries = useContext(QueryClientContext);
  const [meta, setMeta] = useState<{
    projectTitle: string;
    workspaceId: string;
    workspaceName: string;
    canSaveProjectDefault: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open || projectId === null) return;
    let shown = true;
    const cached =
      queries?.getQueryData<readonly WorkspaceRef[]>(["me", userId]) ?? [];
    const syncHit = findProjectWorkspaceSync({
      library,
      userId,
      projectId,
      workspaces: cached,
    });
    const rolePromise = api
      .role(indexDocId("project", projectId))
      .catch(() => null);
    void (async () => {
      let resolved = syncHit;
      if (resolved === null) {
        const me = await api.me().catch(() => null);
        const workspaces = me?.ok ? me.me.workspaces : [];
        resolved = findProjectWorkspaceSync({
          library,
          userId,
          projectId,
          workspaces,
        });
      }
      const role = await rolePromise;
      if (!shown || resolved === null) return;
      // server project `"template"` map is owners-only; editors only see Shared in {workspace}
      const canSaveProjectDefault = role === null ? true : role === "owner";
      setMeta({ ...resolved, canSaveProjectDefault });
    })();
    return () => {
      shown = false;
    };
  }, [open, api, library, userId, projectId, queries]);

  if (
    !open ||
    docId === null ||
    projectId === null ||
    !isTemplateProjectKind(projectKind) ||
    meta === null
  )
    return null;

  const docKind: TemplateKind = rawDocKind === "rundown" ? "rundown" : "script";
  return (
    <SaveTemplateDialog
      open={open}
      onClose={() => dialogActions.close()}
      docId={docId}
      docKind={docKind}
      projectId={projectId}
      projectTitle={meta.projectTitle}
      workspaceId={meta.workspaceId}
      workspaceName={meta.workspaceName}
      initialName={title || meta.projectTitle}
      canSaveProjectDefault={meta.canSaveProjectDefault}
    />
  );
}
