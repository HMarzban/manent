// The project's names as its index keeps them: each under a new id, a character, a set or a term.
import type { JsonMapView } from "@manent/crdt";
import { PROJECT_NAME_KINDS } from "@manent/revisions";
import type { ProjectName } from "@manent/revisions";

/** One of the project's names, with the id its entry is kept under. */
export interface NamesEntry extends ProjectName {
  readonly id: string;
}

const isProjectName = (value: unknown): value is ProjectName =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  "name" in value &&
  PROJECT_NAME_KINDS.some((kind) => kind === value.kind) &&
  typeof value.name === "string" &&
  value.name.trim() !== "";

/** The entries of the `names` map in the shape of a name, in key order; an entry in any other shape reads as absent. */
export function readNames(map: JsonMapView): NamesEntry[] {
  return Object.entries(map.entries()).flatMap(([id, value]) =>
    isProjectName(value) ? [{ id, kind: value.kind, name: value.name }] : [],
  );
}
