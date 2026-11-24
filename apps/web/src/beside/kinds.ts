// What can open beside the page, one line per kind; a feature appends its own line at the end.
import type { ComponentType } from "react";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import type { PersonServices } from "../services/ports.ts";
import { ROOM_LOG_BESIDE_KIND } from "../room-log/beside-kind.ts";
import { ScriptBeside } from "./script-beside.tsx";

export type BesideKindId =
  "script" | "outline" | "room_log" | "source" | "story" | "ink_player";

/** Where Open beside's list is asked from: the document open on the page, and the person's workspaces. */
export interface BesideHere {
  docId: string;
  services: PersonServices;
  workspaceIds: readonly string[];
}

/** One item offered by a beside kind in Open beside's list; either an existing document or one created on first open. */
export interface BesideChoice {
  readonly docId?: string | null;
  readonly label: string;
  /** Called on selection when the document is created on first open; returns the opened docId (or null). */
  open?(here: BesideHere): string | null | Promise<string | null>;
}

export interface BesideKind {
  readonly id: BesideKindId;
  /** The title in the header row; called as the frame draws, so it may read through hooks. */
  title(docId: string): string;
  /** False for an output, such as the Ink player, whose header has no status slots and which has no state bar. */
  readonly hasStatus: boolean;
  readonly Body: ComponentType<{
    docId: string;
    at: { blockId: string } | null;
  }>;
  /** The documents this kind offers in Open beside's list, each by its label there; omitted when none are offered. */
  choices?(here: BesideHere): readonly BesideChoice[];
}

/** The other scripts the person continues, then each other project's first document that is a script, by their titles. */
function otherScripts(
  here: BesideHere,
): readonly { docId: string; label: string }[] {
  const { library } = here.services;
  const seen = new Set([here.docId]);
  // `title` stands in for a script whose own title the index does not hold yet
  const once = (docId: string | null, title: string) => {
    if (docId === null || seen.has(docId)) return [];
    if (library.docKindOf(docId).get() !== "script") return [];
    seen.add(docId);
    return [{ docId, label: library.documentTitle(docId).get() ?? title }];
  };
  return here.workspaceIds.flatMap((workspaceId) => [
    ...library
      .continueList(workspaceId)
      .get()
      .flatMap((item) => once(item.docId, item.title)),
    ...library
      .projects(workspaceId)
      .get()
      .flatMap((project) => once(project.firstDocId, project.title)),
  ]);
}

export const BESIDE_KINDS: readonly BesideKind[] = [
  {
    id: "script",
    title: useDocumentTitle,
    hasStatus: true,
    Body: ScriptBeside,
    choices: otherScripts,
  },
  ROOM_LOG_BESIDE_KIND,
];
