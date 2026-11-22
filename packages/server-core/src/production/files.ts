// An issued file, drawn on request from what was issued only: the issue's version, its settings and the
// anchors recorded with it, the engine it was issued with, and the stored blocks of every revision up to it.
import { REVISION_COLOURS, idOf, issuedMarks } from "@manent/revisions";
import type { RevisionSource } from "@manent/revisions";
import type { BlockJSON } from "@manent/schema";
import type { DocFile, IssueRow, RevisionSetRow } from "@manent/storage";
import type { FileRequest } from "@manent/sync-protocol";
import { materializeVersion } from "../history/content.ts";
import { refused } from "./outcome.ts";
import type { ProductionOutcome } from "./outcome.ts";
import { correctedName } from "./recall.ts";
import type { ProductionOptions, Requests } from "./requests.ts";
import { layoutUnder, memberOf, setBlocksOf } from "./state.ts";

/** Every revision issued up to and including the issue's, oldest first, each marked as it was issued. */
function sourcesOf(
  file: DocFile,
  sets: readonly RevisionSetRow[],
  issued: { set: RevisionSetRow; issue: IssueRow },
  blocks: ReadonlyMap<string, BlockJSON>,
): RevisionSource[] {
  const { set, issue } = issued;
  return sets.flatMap((s): RevisionSource[] => {
    if (s.ordinal > set.ordinal || s.issuedOn === null) return [];
    const own = s.id === set.id;
    return [
      {
        ordinal: s.ordinal,
        name:
          own && issue.kind === "correction" ? correctedName(s.name) : s.name,
        colour: memberOf(REVISION_COLOURS, s.colour, "colour"),
        mark: s.mark,
        day: own ? issue.issuedOn : s.issuedOn,
        fullDraft: s.fullDraft,
        marks: issuedMarks(setBlocksOf(file, s.id), blocks),
      },
    ];
  });
}

export async function issuedFile(
  options: ProductionOptions,
  requests: Requests,
  userId: string,
  request: FileRequest,
): Promise<ProductionOutcome<Uint8Array>> {
  const { docId, issueId } = request;
  const opened = requests.open(userId, docId);
  if (!opened.ok) return opened;
  const { file } = opened;
  const issue = file.production.issues(docId).find((i) => i.id === issueId);
  const sets = file.production.sets(docId);
  const set = sets.find((s) => s.id === issue?.setId);
  const version =
    issue === undefined ? null : file.history.get(issue.versionId);
  const content = version === null ? null : materializeVersion(file, version);
  if (issue === undefined || set === undefined || content === null)
    return refused("not_found");
  const under = layoutUnder(content.settings, set.engineVersion);
  if (!under.ok) return refused(under.reason);
  const { engine, profile } = under;
  const byId = new Map(
    content.blocks.flatMap((block): [string, BlockJSON][] => {
      const id = idOf(block);
      return id === null ? [] : [[id, block]];
    }),
  );
  const numbers = new Map(
    content.blocks.flatMap((block): [string, string][] => {
      const id = idOf(block);
      const num = block.attrs?.num;
      return id !== null && typeof num === "string" ? [[id, num]] : [];
    }),
  );
  const bytes = await options.renderPdf({
    content,
    profile,
    engine,
    anchors: content.locks ?? [],
    numbers,
    sources: sourcesOf(file, sets, { set, issue }, byId),
    pages: issue.what === "changed" ? issue.pages : null,
    marked: request.file === "pdf_marked",
    tint: issue.tint,
  });
  return { ok: true, value: bytes };
}
