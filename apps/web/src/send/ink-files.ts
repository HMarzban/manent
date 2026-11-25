// Writing Ink source, whole-project Ink, compiled Ink JSON, and Game Script line data (JSON and XML).
import { jsonMap, scriptBody } from "@manent/crdt";
import type { InkProblem } from "@manent/formats";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import { GAME_EXPORTS_WORDS, INK_WORDS, LIBRARY_WORDS } from "@manent/ui";
import { archiveSource } from "../archive/archive-source.ts";
import { liveEditor } from "../editor-host/live-editor.ts";
import type { LiveEditor } from "../editor-host/live-editor.ts";
import { summariesOfServices } from "../services/api-cache.ts";
import type { PersonServices } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";
import { fileName } from "./script-file.ts";
import type { WrittenFile } from "./script-file.ts";

interface ExportTarget {
  readonly docId: string;
  readonly title: string;
}

interface ListedInkProject {
  readonly title: string;
  readonly docs: readonly { readonly docId: string; readonly title: string }[];
}

interface GatheredInkProject {
  readonly projectTitle: string;
  readonly joined: string;
  readonly missingTitles: readonly string[];
  readonly problems: readonly InkProblem[];
}

function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text);
  const out = new Uint8Array(encoded.byteLength);
  out.set(encoded);
  return out;
}

function blocksFromDocJson(doc: DocJSON): BlockJSON[] {
  return (doc.content ?? []).flatMap((section) => section.content ?? []);
}

function blocksFromEditor(editor: LiveEditor): BlockJSON[] | null {
  try {
    return blocksFromDocJson(scriptBody(editor.doc).materialize());
  } catch {
    const stateDoc = editor.view?.state?.doc;
    if (stateDoc !== undefined && typeof stateDoc.toJSON === "function")
      return blocksFromDocJson(stateDoc.toJSON() as DocJSON);
    return null;
  }
}

/** Reads the live blocks of `docId` from its open editor, or from this device's local store. */
async function blocksOfDocument(docId: string): Promise<readonly BlockJSON[]> {
  const editor = liveEditor(docId);
  if (editor !== null) {
    const blocks = blocksFromEditor(editor);
    if (blocks !== null) return blocks;
  }
  const services = archiveSource.get();
  if (services !== null) {
    const stored = await services.documentBlocks(docId);
    if (stored !== null) return stored;
  }
  throw new Error(`no open editor holds ${docId}`);
}

/** The project holding `docId`, with all its non-trashed Ink documents in workspace-index order. */
async function inkProjectOf(
  services: PersonServices,
  docId: string,
): Promise<ListedInkProject | null> {
  const me = await services.api.me();
  const listed = me.ok ? me.me.workspaces.map((w) => w.id) : [];
  const candidateIndexIds = new Set<string>(
    [...listed, services.userId].map((id) => indexDocId("workspace", id)),
  );
  if (!me.ok) {
    const userIndex = indexDocId("user", services.userId);
    const summaries = await summariesOfServices(services);
    for (const summary of summaries ?? []) {
      if (summary.docId !== docId && summary.docId !== userIndex)
        candidateIndexIds.add(summary.docId);
    }
  }
  for (const indexId of candidateIndexIds) {
    let handle: Awaited<ReturnType<PersonServices["openHandle"]>>;
    try {
      handle = await services.openHandle(indexId);
    } catch {
      continue;
    }
    try {
      const doc = handle.doc();
      const index = readWorkspace({
        projects: jsonMap(doc, "projects"),
        documents: jsonMap(doc, "documents"),
      });
      const projectId = index.documents.get(docId)?.projectId;
      const project =
        projectId === undefined ? undefined : index.projects.get(projectId);
      if (project === undefined) continue;
      const docs = [...index.documents]
        .filter(
          ([, entry]) =>
            entry.projectId === projectId &&
            entry.kind === "ink" &&
            entry.trashedAt === null,
        )
        .toSorted(
          ([a, x], [b, y]) => x.createdAt - y.createdAt || a.localeCompare(b),
        )
        .map(([id, entry]) => ({
          docId: id,
          title:
            entry.title === "" ? LIBRARY_WORDS.untitledScript : entry.title,
        }));
      return { title: project.title, docs };
    } finally {
      await handle.close();
    }
  }
  return null;
}

/** Gathers a project's Ink documents on this device, joins them, and checks compilation. */
export async function gatherInkProject(
  work: ExportTarget,
): Promise<GatheredInkProject> {
  const { compileInk, inkSourceOf, joinInkProject } =
    await import("@manent/formats");
  const services = archiveSource.get();
  const listed =
    services === null ? null : await inkProjectOf(services, work.docId);
  const projectTitle = listed?.title ?? work.title;
  const docs = listed?.docs ?? [{ docId: work.docId, title: work.title }];

  const parts: { readonly title: string; readonly source: string }[] = [];
  const missingTitles: string[] = [];

  for (const doc of docs) {
    const editor = liveEditor(doc.docId);
    const liveBlocks = editor === null ? null : blocksFromEditor(editor);
    const blocks =
      liveBlocks ??
      (services === null ? null : await services.documentBlocks(doc.docId));
    if (blocks === null) {
      missingTitles.push(doc.title);
      continue;
    }
    parts.push({ title: doc.title, source: inkSourceOf(blocks) });
  }

  const joined = joinInkProject(parts);
  const compiled = compileInk(joined);
  return {
    projectTitle,
    joined,
    missingTitles,
    problems: compiled.problems,
  };
}

/** Formats the Checks notice for Whole project as Ink; null when nothing is missing and compilation is clean. */
export function formatInkProjectNotice(
  missingTitles: readonly string[],
  problems: readonly InkProblem[],
): string | null {
  const lines: string[] = [];
  if (missingTitles.length > 0)
    lines.push(GAME_EXPORTS_WORDS.missingFromDevice(missingTitles));
  if (problems.length > 0) {
    lines.push(GAME_EXPORTS_WORDS.joinedProblemsNotice(problems.length));
    for (const problem of problems)
      lines.push(
        GAME_EXPORTS_WORDS.joinedProblem(problem.line, problem.message),
      );
  }
  return lines.length === 0 ? null : lines.join("\n");
}

/** Writes the open Ink document as a `.ink` source file. */
export async function writeInkSourceFile(
  work: ExportTarget,
): Promise<WrittenFile> {
  const [{ writeInk }, blocks] = await Promise.all([
    import("@manent/formats"),
    blocksOfDocument(work.docId),
  ]);
  return {
    bytes: encodeUtf8(writeInk(blocks)),
    name: fileName(work.title, ".ink"),
  };
}

/** Joins the project's Ink documents on this device as `<project title>.ink`, writing it as it is even with problems. */
export async function writeInkProjectFile(
  work: ExportTarget,
): Promise<WrittenFile> {
  const gathered = await gatherInkProject(work);
  return {
    bytes: encodeUtf8(gathered.joined),
    name: fileName(gathered.projectTitle, ".ink"),
  };
}

/** Reports missing project documents and joined-file compilation problems for Whole project as Ink. */
export async function inkProjectLeftOut(
  work: ExportTarget,
): Promise<string | null> {
  const gathered = await gatherInkProject(work);
  return formatInkProjectNotice(gathered.missingTitles, gathered.problems);
}

/** Reports compile problems for Compiled Ink (JSON) before export; null when clean. */
export async function inkJsonLeftOut(
  work: ExportTarget,
): Promise<string | null> {
  const [{ compileInk, inkSourceOf }, blocks] = await Promise.all([
    import("@manent/formats"),
    blocksOfDocument(work.docId),
  ]);
  const compiled = compileInk(inkSourceOf(blocks));
  if (compiled.ok) return null;
  return compiled.problems
    .map((problem) => INK_WORDS.checkProblem(problem.line, problem.message))
    .join("\n");
}

/** Compiles the open Ink document with inkjs and writes `<title>.ink.json`; rejects cleanly if compilation fails. */
export async function writeInkJsonFile(
  work: ExportTarget,
): Promise<WrittenFile> {
  const [{ compileInk, inkSourceOf }, blocks] = await Promise.all([
    import("@manent/formats"),
    blocksOfDocument(work.docId),
  ]);
  const compiled = compileInk(inkSourceOf(blocks));
  if (!compiled.ok)
    throw new Error(`could not compile Ink document ${work.docId}`);
  return {
    bytes: encodeUtf8(compiled.json),
    name: fileName(work.title, ".ink.json"),
  };
}

/** Writes Game Script line data from the open editor as JSON or XML. */
export async function writeLineDataFile(
  kind: "json" | "xml",
  work: ExportTarget,
): Promise<WrittenFile> {
  const [formats, blocks] = await Promise.all([
    import("@manent/formats"),
    blocksOfDocument(work.docId),
  ]);
  const text =
    kind === "json"
      ? formats.writeLineDataJson(blocks)
      : formats.writeLineDataXml(blocks);
  const extension = kind === "json" ? ".json" : ".xml";
  return {
    bytes: encodeUtf8(text),
    name: fileName(`${work.title} line data`, extension),
  };
}
