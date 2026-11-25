// Offline-first Show and News template service: reads and writes project defaults and workspace templates, and instantiates fresh rundowns and scripts.
import {
  PROJECT_RUNDOWN_SKELETON_KEY,
  PROJECT_SCRIPT_SKELETON_KEY,
  initRundown,
  insertRows,
  jsonMap,
  mintRundownFromTemplate,
  mintScriptFromTemplate,
  readRundown,
  readRundownTemplateSkeleton,
  readScriptTemplateSkeleton,
  readWorkspaceTemplates,
  scriptBody,
  setCell,
  setRowUnnumbered,
  stripRundownForTemplate,
  stripScriptForTemplate,
  writeWorkspaceTemplate,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type {
  CrdtDoc,
  RundownTemplateSkeleton,
  ScriptTemplateSkeleton,
  TemplateKind,
  WorkspaceTemplateEntry,
} from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { FormatId, RundownColumnId } from "@manent/schema";
import { paperForRegion } from "@manent/settings";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { PersonServices, ProjectKind } from "../services/ports.ts";

/** Named project default stored under `project.rundownSkeleton` or `project.scriptSkeleton`. */
export interface StoredProjectTemplate<
  S extends RundownTemplateSkeleton | ScriptTemplateSkeleton,
> {
  readonly name: string;
  readonly skeleton: S;
}

/** True only for Show and News projects, which support reusable templates. */
export function isTemplateProjectKind(
  kind: ProjectKind | null | undefined,
): kind is "show" | "news" {
  return kind === "show" || kind === "news";
}

function readNamedSkeleton<
  S extends RundownTemplateSkeleton | ScriptTemplateSkeleton,
>(
  raw: unknown,
  readSkeleton: (value: unknown) => S | null,
  fallbackName: string,
): StoredProjectTemplate<S> | null {
  const bare = readSkeleton(raw);
  if (bare !== null) return { name: fallbackName, skeleton: bare };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const record = raw as Record<string, unknown>;
  const skeleton = readSkeleton(record.skeleton);
  if (skeleton === null) return null;
  const name =
    typeof record.name === "string" && record.name.trim() !== ""
      ? record.name.trim()
      : fallbackName;
  return { name, skeleton };
}

/** Reads the project's default rundown skeleton from its `"template"` map; null when unset or invalid. */
export function readProjectRundownDefault(
  doc: CrdtDoc,
  fallbackName = "",
): StoredProjectTemplate<RundownTemplateSkeleton> | null {
  return readNamedSkeleton(
    jsonMap(doc, "template").get(PROJECT_RUNDOWN_SKELETON_KEY),
    readRundownTemplateSkeleton,
    fallbackName,
  );
}

/** Reads the project's default script skeleton from its `"template"` map; null when unset or invalid. */
export function readProjectScriptDefault(
  doc: CrdtDoc,
  fallbackName = "",
): StoredProjectTemplate<ScriptTemplateSkeleton> | null {
  return readNamedSkeleton(
    jsonMap(doc, "template").get(PROJECT_SCRIPT_SKELETON_KEY),
    readScriptTemplateSkeleton,
    fallbackName,
  );
}

/** Writes the project's default rundown or script skeleton into its `"template"` map. */
export function writeProjectDefault(
  doc: CrdtDoc,
  kind: TemplateKind,
  entry: StoredProjectTemplate<
    RundownTemplateSkeleton | ScriptTemplateSkeleton
  >,
): void {
  const key =
    kind === "rundown"
      ? PROJECT_RUNDOWN_SKELETON_KEY
      : PROJECT_SCRIPT_SKELETON_KEY;
  jsonMap(doc, "template").set(key, {
    name: entry.name.trim(),
    skeleton: entry.skeleton,
  });
}

/** Clears the project's default rundown or script skeleton from its `"template"` map. */
export function clearProjectDefault(doc: CrdtDoc, kind: TemplateKind): void {
  const key =
    kind === "rundown"
      ? PROJECT_RUNDOWN_SKELETON_KEY
      : PROJECT_SCRIPT_SKELETON_KEY;
  jsonMap(doc, "template").delete(key);
}

/** Reads all shared workspace templates sorted by name ascending. */
export function listWorkspaceTemplates(
  doc: CrdtDoc,
  kind?: TemplateKind,
): readonly WorkspaceTemplateEntry[] {
  const all = [...readWorkspaceTemplates(doc).values()];
  const filtered =
    kind === undefined ? all : all.filter((entry) => entry.kind === kind);
  return filtered.toSorted(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/** Removes one shared template from the workspace index's `"templates"` map. */
export function removeWorkspaceTemplate(
  doc: CrdtDoc,
  templateId: string,
): void {
  jsonMap(doc, "templates").delete(templateId);
}

/** Strips a live document handle (`rundown` or `script`) into a reusable template skeleton. */
export function stripHandleForTemplate(
  handle: DocHandle,
  kind: TemplateKind,
): RundownTemplateSkeleton | ScriptTemplateSkeleton {
  return kind === "rundown"
    ? stripRundownForTemplate(readRundown(handle.doc()))
    : stripScriptForTemplate(scriptBody(handle.doc()).materialize());
}

/** Saves a stripped skeleton to either the project's default or the workspace's shared `"templates"` map, offline-first. */
export async function saveTemplate(options: {
  readonly services: Pick<
    PersonServices,
    "openHandle" | "projectIndex" | "userId"
  >;
  readonly scope: "project" | "workspace";
  readonly projectId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly kind: TemplateKind;
  readonly skeleton: RundownTemplateSkeleton | ScriptTemplateSkeleton;
  readonly now: () => number;
  readonly newId: () => string;
}): Promise<string> {
  const {
    services,
    scope,
    projectId,
    workspaceId,
    kind,
    skeleton,
    now,
    newId,
  } = options;
  const trimmed = options.name.trim();
  if (scope === "project") {
    const index = services.projectIndex(projectId);
    try {
      const handle = await index.handle();
      writeProjectDefault(handle.doc(), kind, { name: trimmed, skeleton });
    } finally {
      await index.close();
    }
    return trimmed;
  }
  const wsHandle = await services.openHandle(
    indexDocId("workspace", workspaceId),
  );
  try {
    const at = now();
    const id = newId();
    const entry: WorkspaceTemplateEntry = {
      id,
      name: trimmed,
      kind,
      createdAt: at,
      createdByUserId: services.userId,
      updatedAt: at,
      skeleton,
    };
    writeWorkspaceTemplate(wsHandle.doc(), entry);
    return id;
  } finally {
    await wsHandle.close();
  }
}

/** Writes a minted rundown template into a fresh `DocHandle` with fresh row IDs, order keys and clean cells. */
export function applyRundownTemplateToHandle(
  handle: DocHandle,
  skeleton: RundownTemplateSkeleton,
  options: {
    readonly userId: string;
    readonly now: () => number;
    readonly airDate: string;
    readonly airAt: number | null;
    readonly newId?: () => string;
  },
): void {
  const current = readRundown(handle.doc());
  if (current.rundown.airDate !== "" || current.columns.length > 0) return;
  const minted = mintRundownFromTemplate(skeleton, {
    newId: options.newId ?? randomBlockId,
    userId: options.userId,
    now: options.now,
    airDate: options.airDate,
    airAt: options.airAt,
  });
  initRundown(handle.doc(), minted.rundown, minted.columns);
  if (minted.rows.length === 0) return;
  insertRows(
    handle.doc(),
    minted.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      docId: null,
      blockId: null,
    })),
    null,
  );
  for (const row of minted.rows) {
    if (row.unnumbered) setRowUnnumbered(handle.doc(), row.id, true);
    for (const [colId, cell] of Object.entries(row.cells)) {
      if (cell === undefined) continue;
      setCell(handle.doc(), row.id, colId as RundownColumnId, cell.value, {
        userId: options.userId,
        now: () => cell.setAt,
      });
    }
  }
}

/** Writes a minted script template into a fresh `DocHandle` with fresh block IDs. */
export function applyScriptTemplateToHandle(
  handle: DocHandle,
  skeleton: ScriptTemplateSkeleton,
  options: {
    readonly language: string;
    readonly format: FormatId;
    readonly newId?: () => string;
  },
): void {
  const doc = handle.doc();
  const minted = mintScriptFromTemplate(skeleton, {
    newId: options.newId ?? randomBlockId,
  });
  const blocks = (minted.content ?? []).flatMap(
    (section) => section.content ?? [],
  );
  if (yXmlFragmentForBinding(doc).length === 0 && blocks.length > 0)
    scriptBody(doc).write((w) => w.insertBlocks(null, blocks));
  handle.setSetting("script.format", options.format);
  handle.setSetting("script.paper", paperForRegion(options.language));
}
