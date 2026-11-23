// Who writes each scene and how far it has got, read from the open script and kept current, with the people who
// may write it; and the two writes, each one undo step.
import {
  ORIGIN_MATERIAL,
  SCENE_PROGRESS_MAP,
  blockIds,
  jsonMap,
  observeScript,
  readBlocks,
  readSceneProgress,
  scriptBody,
  writeSceneProgress,
} from "@manent/crdt";
import type { CrdtDoc, SceneProgress, TransactionReport } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { DocPeopleResponse } from "@manent/sync-protocol";
import { ASSIGNMENT_WORDS, createValue, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useMemo } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { followProductionServices } from "../production/live-services.ts";
import type { ProductionServices } from "../production/services.ts";

export type ScriptPerson = DocPeopleResponse["people"][number];

export interface SceneAssignment {
  /** Each scene's writer by its heading's block id; a scene with none is absent. */
  readonly writers: ReadonlyMap<string, string>;
  /** Each scene's progress by its heading's block id; a scene with no entry is absent and reads not_started. */
  readonly progress: ReadonlyMap<string, SceneProgress>;
  /** Everyone with a role on the script, ascending by `userId`; empty until the server has said. */
  readonly people: readonly ScriptPerson[];
}

/** Each progress as the interface names it. */
export const PROGRESS_NAMES: Readonly<Record<SceneProgress, string>> =
  ASSIGNMENT_WORDS.progressNames;

const NOTHING_TO_STOP = (): void => {};
const NO_PEOPLE: readonly ScriptPerson[] = Object.freeze([]);
const UNASSIGNED: SceneAssignment = Object.freeze({
  writers: new Map(),
  progress: new Map(),
  people: NO_PEOPLE,
});

interface Followed {
  readonly value: Subscribable<SceneAssignment>;
  users: number;
  stop(): void;
}

// one follower per script while anything reads it
const followed = new Map<string, Followed>();

function writerOf(block: BlockJSON): string | null {
  const writer = block.attrs?.writerUserId;
  return typeof writer === "string" ? writer : null;
}

function writersIn(doc: CrdtDoc): ReadonlyMap<string, string> {
  const writers = new Map<string, string>();
  for (const [id, block] of readBlocks(doc, new Set(blockIds(doc)))) {
    const writer = writerOf(block);
    if (writer !== null) writers.set(id, writer);
  }
  return writers;
}

/** `writers` as the change left them; the same map when it changed no writer. */
function writersAfter(
  writers: ReadonlyMap<string, string>,
  report: TransactionReport,
): ReadonlyMap<string, string> {
  const changes = new Map<string, string | null>();
  for (const id of report.removed) changes.set(id, null);
  for (const block of [
    ...report.inserted.map((entry) => entry.block),
    ...report.changed,
  ]) {
    const id = block.attrs?.id;
    if (typeof id === "string") changes.set(id, writerOf(block));
  }
  if (
    [...changes].every(([id, writer]) => (writers.get(id) ?? null) === writer)
  )
    return writers;
  const next = new Map(writers);
  for (const [id, writer] of changes)
    if (writer === null) next.delete(id);
    else next.set(id, writer);
  return next;
}

function progressIn(doc: CrdtDoc): ReadonlyMap<string, SceneProgress> {
  return new Map(
    jsonMap(doc, SCENE_PROGRESS_MAP)
      .keys()
      .map((id): [string, SceneProgress] => [id, readSceneProgress(doc, id)]),
  );
}

/** Keeps the writers and progress of `doc` in `update` until the returned stop; a keystroke reads only the blocks it changed. */
function followDoc(
  doc: CrdtDoc,
  current: () => SceneAssignment,
  update: (patch: Partial<SceneAssignment>) => void,
): () => void {
  update({ writers: writersIn(doc), progress: progressIn(doc) });
  const stops = [
    observeScript(doc, (report) =>
      update({ writers: writersAfter(current().writers, report) }),
    ),
    jsonMap(doc, SCENE_PROGRESS_MAP).subscribe(() =>
      update({ progress: progressIn(doc) }),
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

function start(docId: string): Followed {
  const value = createValue(UNASSIGNED);
  const update = (patch: Partial<SceneAssignment>): void => {
    const now = value.get();
    const next = { ...now, ...patch };
    if (
      next.writers !== now.writers ||
      next.progress !== now.progress ||
      next.people !== now.people
    )
      value.set(next);
  };
  let doc: CrdtDoc | null = null;
  let stopDoc = NOTHING_TO_STOP;
  const followEditor = (): void => {
    const open = liveEditor(docId)?.doc ?? null;
    if (open === doc) return;
    stopDoc();
    doc = open;
    if (open !== null) stopDoc = followDoc(open, value.get, update);
    else {
      stopDoc = NOTHING_TO_STOP;
      update({ writers: UNASSIGNED.writers, progress: UNASSIGNED.progress });
    }
  };
  // asked once for each of the script's production services while this follower lives
  const asked = new WeakMap<
    ProductionServices,
    Subscribable<readonly ScriptPerson[]>
  >();
  const peopleOf = (
    services: ProductionServices,
  ): Subscribable<readonly ScriptPerson[]> => {
    const held = asked.get(services);
    if (held !== undefined) return held;
    const people = createValue(NO_PEOPLE);
    asked.set(services, people);
    void services.people().then((known) => {
      if (known !== null) people.set(known);
    });
    return people;
  };
  const stops = [
    subscribeLiveEditors(followEditor),
    followProductionServices(docId, peopleOf, NO_PEOPLE).subscribe((people) =>
      update({ people }),
    ),
  ];
  followEditor();
  return {
    value,
    users: 0,
    stop() {
      for (const stop of stops) stop();
      stopDoc();
    },
  };
}

/** The scene assignment of `docId`'s open script, followed while something listens; nothing assigned while none is open. */
export function sceneAssignmentOf(
  docId: string,
): Subscribable<SceneAssignment> {
  const get = (): SceneAssignment =>
    followed.get(docId)?.value.get() ?? UNASSIGNED;
  return {
    get,
    subscribe(listener) {
      const before = get();
      let held = followed.get(docId);
      if (held === undefined) {
        held = start(docId);
        followed.set(docId, held);
      }
      const following = held;
      following.users++;
      const stop = following.value.subscribe(listener);
      // what was read on starting is told to the first listener at once
      if (following.value.get() !== before) listener(following.value.get());
      return () => {
        stop();
        following.users--;
        if (following.users > 0) return;
        following.stop();
        followed.delete(docId);
      };
    },
  };
}

export function useSceneAssignment(docId: string): SceneAssignment {
  return useSubscribable(useMemo(() => sceneAssignmentOf(docId), [docId]));
}

/** The scene's writer as the people list names them; null for a scene with no writer, or one the list does not hold. */
export function sceneWriterOf(
  assignment: SceneAssignment,
  headingId: string,
): ScriptPerson | null {
  const writer = assignment.writers.get(headingId);
  if (writer === undefined) return null;
  return assignment.people.find((person) => person.userId === writer) ?? null;
}

/** The Writer picker's choices: No writer, then each person who may write the script. */
export function writerChoices(
  people: readonly ScriptPerson[],
): readonly { value: string | null; label: string }[] {
  return [
    { value: null, label: ASSIGNMENT_WORDS.noWriter },
    ...people.map((person) => ({ value: person.userId, label: person.name })),
  ];
}

/** Sets the scene's writer as one undo step; null takes it away. Nothing is written while the script's editor is not open. */
export function setSceneWriter(
  docId: string,
  headingId: string,
  userId: string | null,
): void {
  const doc = liveEditor(docId)?.doc;
  if (doc === undefined) return;
  scriptBody(doc).write((writer) => {
    writer.setBlockAttrs(headingId, { writerUserId: userId });
  }, ORIGIN_MATERIAL);
}

/** Sets the scene's progress as one undo step. Nothing is written while the script's editor is not open. */
export function setSceneProgress(
  docId: string,
  headingId: string,
  progress: SceneProgress,
): void {
  const doc = liveEditor(docId)?.doc;
  if (doc === undefined) return;
  writeSceneProgress(doc, headingId, progress, ORIGIN_MATERIAL);
}
