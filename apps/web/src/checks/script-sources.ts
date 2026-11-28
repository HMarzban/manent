// Stage 2 Check sources: new names, near-matches, overused words, pages over target, and new proper nouns.
import { findScriptChecks } from "@manent/revisions";
import type { ScriptCheck, ScriptCheckKind } from "@manent/revisions";
import { FORMATS } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { CHECKS_WORDS } from "@manent/ui";
import { liveEditor, livePagination } from "../editor-host/live-editor.ts";
import { recordCheckDetail, snapshotChecksContext } from "./checks-context.ts";

interface Stage2Check {
  readonly id: string;
  readonly sentence: string;
  readonly action: null;
}

interface Stage2CheckSource {
  readonly id: string;
  find(docId: string): readonly Stage2Check[];
}

interface CachedRun {
  readonly pmDoc: unknown;
  readonly pageCount: number;
  readonly contextVersion: number;
  readonly targetPages: number | null;
  readonly lastSentName: string | null;
  readonly checks: readonly ScriptCheck[];
}

const lastRunByDoc = new Map<string, CachedRun>();

function readDocJson(docId: string): { pmDoc: unknown; json: DocJSON } | null {
  const editor = liveEditor(docId);
  const pmDoc = editor?.view?.state?.doc;
  if (
    pmDoc === undefined ||
    pmDoc === null ||
    typeof pmDoc.toJSON !== "function"
  )
    return null;
  const json: DocJSON = pmDoc.toJSON();
  return { pmDoc, json };
}

/** Runs `findScriptChecks` once across all five Stage 2 sources for the same script snapshot and context version. */
function runScriptChecks(docId: string): {
  checks: readonly ScriptCheck[];
  lastSentName: string | null;
} {
  const read = readDocJson(docId);
  if (read === null) return { checks: [], lastSentName: null };
  const pagination = livePagination(docId);
  const pageCount = pagination?.pages.length ?? 0;
  const rawFormat = pagination?.profile.format;
  const format = FORMATS.find((id) => id === rawFormat);
  const ctx = snapshotChecksContext(docId);
  const cached = lastRunByDoc.get(docId);
  if (
    cached !== undefined &&
    cached.pmDoc === read.pmDoc &&
    cached.pageCount === pageCount &&
    cached.contextVersion === ctx.version &&
    cached.targetPages === ctx.targetPages
  ) {
    return { checks: cached.checks, lastSentName: cached.lastSentName };
  }
  const checks = findScriptChecks({
    doc: read.json,
    lastSent: ctx.lastSent,
    names: ctx.names,
    pageCount,
    targetPages: ctx.targetPages,
    format,
  });
  for (const check of checks) {
    recordCheckDetail(docId, check.key, {
      anchor: check.anchor,
      subject: check.text,
    });
  }
  lastRunByDoc.set(docId, {
    pmDoc: read.pmDoc,
    pageCount,
    contextVersion: ctx.version,
    targetPages: ctx.targetPages,
    lastSentName: ctx.lastSentName,
    checks,
  });
  return { checks, lastSentName: ctx.lastSentName };
}

function sentenceOf(check: ScriptCheck, lastSentName: string | null): string {
  switch (check.kind) {
    case "new_name":
      return CHECKS_WORDS.newName(check.text);
    case "near_match":
      return CHECKS_WORDS.nearMatch(check.text, check.matchedName);
    case "overused_word":
      return CHECKS_WORDS.overusedWord(check.text, check.count);
    case "pages_over_target":
      return CHECKS_WORDS.pagesOverTarget(
        check.pages,
        check.over,
        check.target,
      );
    case "new_proper_noun":
      return lastSentName === null
        ? CHECKS_WORDS.newName(check.text)
        : CHECKS_WORDS.newProperNounSince(check.text, lastSentName);
    case "empty_footnote":
      return CHECKS_WORDS.emptyFootnote(check.ordinal);
    case "figure_missing_alt":
      return CHECKS_WORDS.figureMissingAlt(check.text);
    case "chapter_under_target":
      return CHECKS_WORDS.chapterUnderTarget(
        check.text,
        check.words,
        check.target,
      );
    case "unbalanced_quotes":
      return CHECKS_WORDS.unbalancedQuotes(check.text);
  }
}

function sourceFor(kind: ScriptCheckKind): Stage2CheckSource {
  return {
    id: kind,
    find(docId): readonly Stage2Check[] {
      const { checks, lastSentName } = runScriptChecks(docId);
      return checks
        .filter((check) => check.kind === kind)
        .map((check) => ({
          id: check.text,
          sentence: sentenceOf(check, lastSentName),
          action: null,
        }));
    },
  };
}

export const STAGE_2_CHECK_SOURCES: readonly Stage2CheckSource[] =
  Object.freeze([
    sourceFor("new_name"),
    sourceFor("near_match"),
    sourceFor("overused_word"),
    sourceFor("pages_over_target"),
    sourceFor("new_proper_noun"),
    sourceFor("empty_footnote"),
    sourceFor("figure_missing_alt"),
    sourceFor("chapter_under_target"),
    sourceFor("unbalanced_quotes"),
  ]);
