import { withDom } from "@manent/testkit/dom";
import { COMMANDS } from "@manent/commands";
import type { CommandContext } from "@manent/commands";
import {
  createDoc,
  initRundown,
  insertRows,
  readRundown,
  scriptBody,
  setCell,
  stripRundownForTemplate,
  stripScriptForTemplate,
  writeWorkspaceTemplate,
} from "@manent/crdt";
import type {
  CrdtDoc,
  RundownTemplateSkeleton,
  WorkspaceTemplateEntry,
} from "@manent/crdt";
import { SHOW_COLUMNS, randomBlockId } from "@manent/schema";
import type { DocHandle, DocStatus, SyncClient } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import {
  DIALOG_WORDS,
  LAYOUT_SETTINGS_WORDS,
  SHARING_WORDS,
  SHOW_TEMPLATE_WORDS,
  createValue,
} from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { openProjectIndex } from "../src/project/project-index.ts";
import {
  NewRundownSplitControl,
  createProjectRundownWithTemplate,
} from "../src/rundown/library-rundowns-template.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type {
  CreateResult,
  DocumentStart,
  LibraryIndex,
  PersonServices,
  ProjectKind,
} from "../src/services/ports.ts";
import { isProjectUntouched } from "../src/services/sync/library-create.ts";
import { dialogActions } from "../src/state/dialog.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { TemplatesGroup } from "../src/templates/project-templates-panel.tsx";
import {
  SaveTemplateDialog,
  SaveTemplateHost,
} from "../src/templates/save-template-dialog.tsx";
import {
  applyScriptTemplateToHandle,
  listWorkspaceTemplates,
  readProjectRundownDefault,
  readProjectScriptDefault,
  writeProjectDefault,
} from "../src/templates/template-service.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();

const NOW = new Date(2026, 10, 18, 12, 0, 0).getTime();
const ROW_HDR_ID = randomBlockId();
const ROW_SEG_ID = randomBlockId();
const BLK_1_ID = randomBlockId();
const BLK_2_ID = randomBlockId();

let mounted: Root | null = null;

afterEach(async () => {
  if (mounted === null) return;
  await act(async () => {
    dialogActions.close();
    mounted?.unmount();
  });
  mounted = null;
  document.body.replaceChildren();
});

function fakeHandle(
  docId: string,
  crdtDoc: CrdtDoc,
  settings = new Map<string, unknown>(),
): DocHandle {
  const status = createValue<DocStatus>({
    link: "online",
    docSync: "synced",
    synced: true,
    saved: true,
    neverSynced: false,
    waiting: 0,
    wentOfflineAt: null,
    recovered: 0,
    side: [],
  });
  return {
    docId,
    doc: () => crdtDoc,
    status,
    lastServerSeq: () => 1,
    on: () => () => {},
    getSetting: (key: string) => settings.get(key),
    setSetting: (key: string, value: unknown) => {
      settings.set(key, value);
    },
    flush: async () => {},
    close: async () => {},
  } as unknown as DocHandle;
}

function makeSampleRundownDoc(): CrdtDoc {
  const doc = createDoc();
  initRundown(
    doc,
    {
      airDate: "2026-11-18",
      airAt: NOW + 3_600_000,
      windowLeadMs: 1_800_000,
      targetMs: 1_800_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    doc,
    [
      { id: ROW_HDR_ID, kind: "header", docId: null, blockId: null },
      { id: ROW_SEG_ID, kind: "script", docId: "story-1", blockId: null },
    ],
    null,
  );
  setCell(doc, ROW_HDR_ID, "story", "Cold open", {
    userId: "dana",
    now: () => NOW,
  });
  setCell(doc, ROW_SEG_ID, "story", "Monologue", {
    userId: "dana",
    now: () => NOW,
  });
  setCell(doc, ROW_SEG_ID, "story", "Monologue v2", {
    userId: "dana",
    now: () => NOW + 1_000,
  });
  return doc;
}

function makeSampleScriptDoc(): CrdtDoc {
  const doc = createDoc();
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: BLK_1_ID, type: "slug", kind: null },
        content: [
          {
            type: "text",
            text: "ACT ONE",
            marks: [{ type: "suggest_insert" }],
          },
        ],
      },
      {
        type: "block",
        attrs: { id: BLK_2_ID, type: "action", kind: null },
        content: [{ type: "text", text: "Desk lights come up." }],
      },
    ]),
  );
  return doc;
}

function makeServicesWithDocs(docs: ReadonlyMap<string, CrdtDoc>): {
  services: PersonServices;
  environment: ReturnType<typeof testEnvironment>;
} {
  let seq = 0;
  const environment = testEnvironment({
    now: () => NOW + seq * 1000,
    randomId: () => `id-${++seq}`,
  });
  bindGuard(environment.guard);
  const openHandle = async (docId: string): Promise<DocHandle> => {
    const found = docs.get(docId);
    if (found === undefined) throw new Error(`missing test doc ${docId}`);
    return fakeHandle(docId, found);
  };
  const fakeClient = Promise.resolve({
    open: openHandle,
  } as unknown as SyncClient);
  const base = testServices({
    userId: "dana",
    environment,
  });
  const services: PersonServices = {
    ...base,
    openHandle,
    projectIndex: (projectId) =>
      openProjectIndex({ client: fakeClient, projectId }),
  };
  return { services, environment };
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

function makeContext(overrides: Partial<CommandContext>): CommandContext {
  return {
    platform: "web",
    surface: "script",
    role: "owner",
    editing: false,
    selection: "caret",
    scriptFormat: "variety",
    block: null,
    docOpen: true,
    docKind: "rundown",
    projectKind: "show",
    connection: "online",
    historyMode: null,
    zoom: 1,
    hasPrevious: false,
    hasNext: false,
    ...overrides,
  } as CommandContext;
}

describe("template.save command gating", () => {
  const saveCmd = COMMANDS.find((cmd) => cmd.id === "template.save");

  test("registers Save template… opening save_template_dialog", () => {
    expect(saveCmd).toBeDefined();
    expect(saveCmd?.label).toBe(SHOW_TEMPLATE_WORDS.saveCommand);
    expect(saveCmd?.opens).toEqual({
      surface: "save_template_dialog",
      focus: "first",
    });
  });

  test("is visible only on Show and News projects for owners and editors", () => {
    expect(
      saveCmd?.visible(makeContext({ projectKind: "show", role: "owner" })),
    ).toBe(true);
    expect(
      saveCmd?.visible(makeContext({ projectKind: "news", role: "editor" })),
    ).toBe(true);
    expect(
      saveCmd?.visible(makeContext({ projectKind: "show", role: "viewer" })),
    ).toBe(false);
    expect(
      saveCmd?.visible(makeContext({ projectKind: "news", role: "commenter" })),
    ).toBe(false);
    expect(
      saveCmd?.visible(makeContext({ projectKind: "show", docOpen: false })),
    ).toBe(false);
    const hiddenKinds: readonly ProjectKind[] = [
      "film",
      "series",
      "book",
      "stage_play",
      "game",
    ];
    for (const kind of hiddenKinds) {
      expect(
        saveCmd?.visible(makeContext({ projectKind: kind, role: "owner" })),
      ).toBe(false);
    }
  });
});

describe("SaveTemplateDialog", () => {
  test("saves stripped rundown template as project default offline-first", async () => {
    const rundownDoc = makeSampleRundownDoc();
    const projectDoc = createDoc();
    const wsDoc = createDoc();
    const docs = new Map<string, CrdtDoc>([
      ["rd-1", rundownDoc],
      [indexDocId("project", "proj-1"), projectDoc],
      [indexDocId("workspace", "ws-1"), wsDoc],
    ]);
    const { services, environment } = makeServicesWithDocs(docs);
    let closed = false;
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    await act(async () => {
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <SaveTemplateDialog
              open={true}
              onClose={() => {
                closed = true;
              }}
              docId="rd-1"
              docKind="rundown"
              projectId="proj-1"
              projectTitle="The Late Desk"
              workspaceId="ws-1"
              workspaceName="Studio A"
              initialName="Weeknight show"
            />
          </ServicesProvider>
        </EnvironmentProvider>,
      );
    });
    await flushMicrotasks();

    const dialog = document.body.querySelector<HTMLElement>(
      '[data-surface="save_template_dialog"]',
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain(SHOW_TEMPLATE_WORDS.rundownStripNote);
    expect(dialog?.textContent).toContain(SHOW_TEMPLATE_WORDS.projectDefault);
    expect(dialog?.textContent).toContain(
      SHOW_TEMPLATE_WORDS.sharedInWorkspace("Studio A"),
    );

    const submit = dialog?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(submit?.textContent).toBe(SHOW_TEMPLATE_WORDS.saveAction);
    await act(async () => {
      submit?.click();
    });
    await flushMicrotasks();

    expect(closed).toBe(true);
    const saved = readProjectRundownDefault(projectDoc);
    expect(saved?.name).toBe("Weeknight show");
    expect(saved?.skeleton.rows.map((r) => r.cells.story)).toEqual([
      "Cold open",
      "Monologue v2",
    ]);
    // dates, timings, previous values stripped
    expect(saved?.skeleton.rundown.targetMs).toBe(1_800_000);
    expect(services.messages.current()?.text).toBe(
      SHOW_TEMPLATE_WORDS.savedProjectDefault("Weeknight show"),
    );
  });

  test("saves stripped script template to workspace templates map", async () => {
    const scriptDoc = makeSampleScriptDoc();
    const projectDoc = createDoc();
    const wsDoc = createDoc();
    const docs = new Map<string, CrdtDoc>([
      ["sc-1", scriptDoc],
      [indexDocId("project", "proj-1"), projectDoc],
      [indexDocId("workspace", "ws-1"), wsDoc],
    ]);
    const { services, environment } = makeServicesWithDocs(docs);
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    await act(async () => {
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <SaveTemplateDialog
              open={true}
              onClose={() => {}}
              docId="sc-1"
              docKind="script"
              projectId="proj-1"
              projectTitle="The Late Desk"
              workspaceId="ws-1"
              workspaceName="Studio A"
              initialName="Desk opener"
              canSaveProjectDefault={false}
            />
          </ServicesProvider>
        </EnvironmentProvider>,
      );
    });
    await flushMicrotasks();

    const dialog = document.body.querySelector<HTMLElement>(
      '[data-surface="save_template_dialog"]',
    );
    expect(dialog?.textContent).toContain(SHOW_TEMPLATE_WORDS.scriptStripNote);

    const submit = dialog?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    await act(async () => {
      submit?.click();
    });
    await flushMicrotasks();

    const wsEntries = listWorkspaceTemplates(wsDoc, "script");
    expect(wsEntries).toHaveLength(1);
    expect(wsEntries[0]?.name).toBe("Desk opener");
    // suggestion marks stripped from script skeleton
    const firstBlock =
      wsEntries[0]?.skeleton.kind === "script"
        ? wsEntries[0].skeleton.blocks[0]
        : undefined;
    expect(firstBlock?.content?.[0]?.marks).toBeUndefined();
    expect(services.messages.current()?.text).toBe(
      SHOW_TEMPLATE_WORDS.savedInWorkspace("Desk opener", "Studio A"),
    );
  });
});

describe("TemplatesGroup in Project settings", () => {
  test("renders nothing for non-Show/News project kinds", async () => {
    const projectDoc = createDoc();
    const wsDoc = createDoc();
    const docs = new Map<string, CrdtDoc>([
      [indexDocId("project", "proj-film"), projectDoc],
      [indexDocId("workspace", "ws-1"), wsDoc],
    ]);
    const { services, environment } = makeServicesWithDocs(docs);
    const index = services.projectIndex("proj-film");
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    const excluded: readonly ProjectKind[] = [
      "film",
      "series",
      "book",
      "stage_play",
      "game",
    ];
    for (const kind of excluded) {
      await act(async () => {
        mounted?.render(
          <EnvironmentProvider environment={environment}>
            <ServicesProvider services={services}>
              <TemplatesGroup
                index={index}
                projectId="proj-film"
                projectKind={kind}
                canChangeDefaults={true}
                canEditWorkspace={true}
                workspaceId="ws-1"
                workspaceName="Studio A"
              />
            </ServicesProvider>
          </EnvironmentProvider>,
        );
      });
      await flushMicrotasks();
      expect(container.textContent).toBe("");
    }
    await index.close();
  });

  test("supports immediate Clear + Undo and workspace Use as default + in-place Remove", async () => {
    const projectDoc = createDoc();
    const wsDoc = createDoc();
    const skeleton = stripRundownForTemplate(
      readRundown(makeSampleRundownDoc()),
    );
    writeProjectDefault(projectDoc, "rundown", {
      name: "Nightly default",
      skeleton,
    });
    const wsEntry: WorkspaceTemplateEntry = {
      id: "wt-1",
      name: "Breaking bulletin",
      kind: "rundown",
      createdAt: NOW,
      createdByUserId: "dana",
      updatedAt: NOW,
      skeleton,
    };
    writeWorkspaceTemplate(wsDoc, wsEntry);

    const docs = new Map<string, CrdtDoc>([
      [indexDocId("project", "proj-show"), projectDoc],
      [indexDocId("workspace", "ws-1"), wsDoc],
    ]);
    const { services, environment } = makeServicesWithDocs(docs);
    const index = services.projectIndex("proj-show");
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    await act(async () => {
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <TemplatesGroup
              index={index}
              projectId="proj-show"
              projectKind="show"
              canChangeDefaults={true}
              canEditWorkspace={true}
              workspaceId="ws-1"
              workspaceName="Studio A"
            />
          </ServicesProvider>
        </EnvironmentProvider>,
      );
    });
    await flushMicrotasks();

    expect(container.textContent).toContain(SHOW_TEMPLATE_WORDS.heading);
    expect(container.textContent).toContain("Nightly default");
    expect(container.textContent).toContain(
      SHOW_TEMPLATE_WORDS.noneStartsBlank,
    );
    expect(container.textContent).toContain("Breaking bulletin");

    // 1. Immediate Clear + MessageSlot Undo
    const clearBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === SHOW_TEMPLATE_WORDS.clear,
    );
    expect(clearBtn).toBeDefined();
    await act(async () => {
      clearBtn?.click();
    });
    await flushMicrotasks();

    expect(readProjectRundownDefault(projectDoc)).toBeNull();
    const clearMsg = services.messages.current();
    expect(clearMsg?.text).toBe(SHOW_TEMPLATE_WORDS.clearedDefaultRundown);
    expect(clearMsg?.actions[0]?.label).toBe(LAYOUT_SETTINGS_WORDS.undo);

    // Undo restores the cleared default
    expect(clearMsg).not.toBeNull();
    await act(async () => {
      expect(services.reverses.run(clearMsg!.id)).toBe(true);
    });
    await flushMicrotasks();
    expect(readProjectRundownDefault(projectDoc)?.name).toBe("Nightly default");

    // 2. Use workspace template as project default
    const useBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === SHOW_TEMPLATE_WORDS.useAsProjectDefault,
    );
    expect(useBtn).toBeDefined();
    await act(async () => {
      useBtn?.click();
    });
    await flushMicrotasks();
    expect(readProjectRundownDefault(projectDoc)?.name).toBe(
      "Breaking bulletin",
    );

    // 3. In-place Remove confirmation (no modal dialog)
    const removeBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === SHARING_WORDS.remove,
    );
    expect(removeBtn).toBeDefined();
    await act(async () => {
      removeBtn?.click();
    });
    await flushMicrotasks();

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain(
      SHOW_TEMPLATE_WORDS.removeConfirm("Breaking bulletin"),
    );
    expect(container.textContent).toContain(DIALOG_WORDS.cancel);

    const confirmRemoveBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === SHARING_WORDS.remove,
    );
    await act(async () => {
      confirmRemoveBtn?.click();
    });
    await flushMicrotasks();
    expect(listWorkspaceTemplates(wsDoc)).toHaveLength(0);
    await index.close();
  });
});

describe("NewRundownSplitControl and template instantiation", () => {
  test("stays a single button with no chevron when 0 templates exist", async () => {
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);
    const created: Array<RundownTemplateSkeleton | null> = [];

    await act(async () => {
      mounted?.render(
        <NewRundownSplitControl
          disabled={false}
          reason={null}
          templates={{ defaultRundown: null, workspaceRundowns: [] }}
          onCreate={(skeleton) => created.push(skeleton)}
        />,
      );
    });

    expect(
      container.querySelector('[data-tour="rundown:new_menu"]'),
    ).toBeNull();
    const btn = container.querySelector<HTMLButtonElement>("button");
    await act(async () => {
      btn?.click();
    });
    expect(created).toEqual([null]);
  });

  test("auto-uses project default on primary click and exposes chevron menu when templates exist", async () => {
    const skeleton = stripRundownForTemplate(
      readRundown(makeSampleRundownDoc()),
    );
    const wsEntry: WorkspaceTemplateEntry = {
      id: "wt-2",
      name: "Weekend special",
      kind: "rundown",
      createdAt: NOW,
      createdByUserId: "dana",
      updatedAt: NOW,
      skeleton,
    };
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);
    const created: Array<RundownTemplateSkeleton | null> = [];

    await act(async () => {
      mounted?.render(
        <NewRundownSplitControl
          disabled={false}
          reason={null}
          templates={{
            defaultRundown: { name: "Weeknight", skeleton },
            workspaceRundowns: [wsEntry],
          }}
          onCreate={(s) => created.push(s)}
        />,
      );
    });

    const menuTrigger = container.querySelector<HTMLButtonElement>(
      '[data-tour="rundown:new_menu"]',
    );
    expect(menuTrigger).not.toBeNull();
    expect(menuTrigger?.getAttribute("aria-label")).toBe(
      SHOW_TEMPLATE_WORDS.moreNewRundownChoices,
    );

    const primaryBtn = container.querySelector<HTMLButtonElement>("button");
    await act(async () => {
      primaryBtn?.click();
    });
    expect(created).toEqual([skeleton]);
  });

  test("createProjectRundownWithTemplate mints fresh IDs and sets createdFromTemplate: true", async () => {
    const sourceDoc = makeSampleRundownDoc();
    const skeleton = stripRundownForTemplate(readRundown(sourceDoc));
    const mintedDoc = createDoc();
    let capturedStart: DocumentStart | null = null;
    const { services } = makeServicesWithDocs(new Map());
    const library = {
      addCopy: async (
        _ws: string,
        projectId: string | null,
        _kind: ProjectKind,
        _title: string,
        start: DocumentStart,
      ): Promise<CreateResult> => {
        capturedStart = start;
        start.start(fakeHandle("new-rd", mintedDoc));
        return { projectId: projectId ?? "proj-1", docId: "new-rd" };
      },
    } as unknown as LibraryIndex;

    const result = await createProjectRundownWithTemplate({
      services: {
        library,
        messages: services.messages,
        userId: "dana",
      },
      workspaceId: "ws-1",
      projectId: "proj-1",
      kind: "show",
      existing: [],
      nowMs: NOW,
      skeleton,
    });

    expect(result.docId).toBe("new-rd");
    expect((capturedStart as DocumentStart | null)?.createdFromTemplate).toBe(
      true,
    );
    const instantiated = readRundown(mintedDoc);
    expect(instantiated.rows.map((r) => r.cells.story?.value)).toEqual([
      "Cold open",
      "Monologue v2",
    ]);
    expect(
      instantiated.rows.every(
        (r) => r.id !== ROW_HDR_ID && r.id !== ROW_SEG_ID,
      ),
    ).toBe(true);
    expect(
      instantiated.rows.every((r) => r.cells.story?.previous === null),
    ).toBe(true);
  });

  test("applyScriptTemplateToHandle mints fresh block IDs and configures script settings", () => {
    const scriptSkeleton = stripScriptForTemplate(
      scriptBody(makeSampleScriptDoc()).materialize(),
    );
    const freshDoc = createDoc();
    const settings = new Map<string, unknown>();
    applyScriptTemplateToHandle(
      fakeHandle("sc-new", freshDoc, settings),
      scriptSkeleton,
      {
        language: "en-US",
        format: "variety",
      },
    );
    const body = scriptBody(freshDoc).materialize();
    const blocks = (body.content ?? []).flatMap((s) => s.content ?? []);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.attrs?.id).not.toBe(BLK_1_ID);
    expect(blocks[1]?.attrs?.id).not.toBe(BLK_2_ID);
    expect(settings.get("script.format")).toBe("variety");
    expect(settings.get("script.paper")).toBe("letter");
    expect(readProjectScriptDefault(createDoc())).toBeNull();
  });

  test("isProjectUntouched returns false whenever createdFromTemplate is true", () => {
    const handle = fakeHandle("doc-1", createDoc());
    expect(
      isProjectUntouched(
        {
          projectId: "p-1",
          kind: "show",
          title: "Untitled show",
          createdFromTemplate: true,
          isUntouched: () => true,
        },
        handle,
      ),
    ).toBe(false);
    expect(
      isProjectUntouched(
        {
          projectId: "p-1",
          kind: "show",
          title: "Untitled show",
          createdFromTemplate: false,
          isUntouched: () => true,
        },
        handle,
      ),
    ).toBe(true);
  });
});

function makeHostServices(options: {
  readonly docs: ReadonlyMap<string, CrdtDoc>;
  readonly api: PersonServices["api"];
}): {
  services: PersonServices;
  environment: ReturnType<typeof testEnvironment>;
} {
  const { services: base, environment } = makeServicesWithDocs(options.docs);
  const projectItem = {
    projectId: "proj-1",
    title: "The Late Desk",
    kind: "show" as const,
    firstDocId: "rd-1",
    lastEdited: { byName: "Dana", at: NOW },
    place: { kind: "synced" as const },
  };
  const library = {
    ...base.library,
    projects: (wsId: string) =>
      createValue(wsId === "ws-1" ? [projectItem] : []),
    documentProject: (id: string) =>
      createValue(id === "rd-1" ? "proj-1" : null),
    documentKind: (id: string) =>
      createValue(id === "rd-1" ? ("show" as ProjectKind) : null),
    documentTitle: (id: string) =>
      createValue(id === "rd-1" ? "Weeknight rundown" : null),
    docKindOf: (id: string) =>
      createValue(id === "rd-1" ? ("rundown" as const) : null),
  };
  return {
    environment,
    services: { ...base, api: options.api, library },
  };
}

describe("SaveTemplateHost ACL and offline workspace resolution", () => {
  test("editor role hides This project's default and saves to workspace templates", async () => {
    const rundownDoc = makeSampleRundownDoc();
    const projectDoc = createDoc();
    const wsDoc = createDoc();
    const docs = new Map<string, CrdtDoc>([
      ["rd-1", rundownDoc],
      [indexDocId("project", "proj-1"), projectDoc],
      [indexDocId("workspace", "ws-1"), wsDoc],
    ]);
    const ws: WorkspaceRef = { id: "ws-1", name: "Studio A", seeding: null };
    const { services: base } = makeServicesWithDocs(docs);
    const { services, environment } = makeHostServices({
      docs,
      api: {
        ...base.api,
        me: async () => ({
          ok: true,
          me: { userId: "dana", name: "Dana", workspaces: [ws] },
        }),
        role: async (docId) =>
          docId === indexDocId("project", "proj-1") ? "edit" : null,
      },
    });

    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    await act(async () => {
      dialogActions.open("save_template");
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <SaveTemplateHost docId="rd-1" />
          </ServicesProvider>
        </EnvironmentProvider>,
      );
    });
    await flushMicrotasks();

    const dialog = document.body.querySelector<HTMLElement>(
      '[data-surface="save_template_dialog"]',
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).not.toContain(
      SHOW_TEMPLATE_WORDS.projectDefault,
    );
    expect(dialog?.textContent).toContain(
      SHOW_TEMPLATE_WORDS.sharedInWorkspace("Studio A"),
    );

    const submit = dialog?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    await act(async () => {
      submit?.click();
    });
    await flushMicrotasks();

    expect(readProjectRundownDefault(projectDoc)).toBeNull();
    expect(listWorkspaceTemplates(wsDoc, "rundown")).toHaveLength(1);
    expect(listWorkspaceTemplates(wsDoc, "rundown")[0]?.name).toBe(
      "Weeknight rundown",
    );
  });

  test("opens and saves offline using cached workspaces when api.me() is unreachable", async () => {
    const rundownDoc = makeSampleRundownDoc();
    const projectDoc = createDoc();
    const wsDoc = createDoc();
    const docs = new Map<string, CrdtDoc>([
      ["rd-1", rundownDoc],
      [indexDocId("project", "proj-1"), projectDoc],
      [indexDocId("workspace", "ws-1"), wsDoc],
    ]);
    const ws: WorkspaceRef = { id: "ws-1", name: "Studio A", seeding: null };
    const { services: base } = makeServicesWithDocs(docs);
    let meCalls = 0;
    const { services, environment } = makeHostServices({
      docs,
      api: {
        ...base.api,
        me: async () => {
          meCalls += 1;
          throw new Error("offline");
        },
        role: async () => {
          throw new Error("offline");
        },
      },
    });

    const queryClient = new QueryClient();
    queryClient.setQueryData<readonly WorkspaceRef[]>(["me", "dana"], [ws]);

    const container = document.createElement("div");
    document.body.replaceChildren(container);
    mounted = createRoot(container);

    await act(async () => {
      dialogActions.open("save_template");
      mounted?.render(
        <QueryClientProvider client={queryClient}>
          <EnvironmentProvider environment={environment}>
            <ServicesProvider services={services}>
              <SaveTemplateHost docId="rd-1" />
            </ServicesProvider>
          </EnvironmentProvider>
        </QueryClientProvider>,
      );
    });
    await flushMicrotasks();

    expect(meCalls).toBe(0);
    const dialog = document.body.querySelector<HTMLElement>(
      '[data-surface="save_template_dialog"]',
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain(
      SHOW_TEMPLATE_WORDS.sharedInWorkspace("Studio A"),
    );

    const submit = dialog?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    await act(async () => {
      submit?.click();
    });
    await flushMicrotasks();

    expect(readProjectRundownDefault(projectDoc)?.name).toBe(
      "Weeknight rundown",
    );
  });
});
