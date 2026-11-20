// How closely two versions can be compared, from the builds and engines that made them.
import { ENGINE_VERSION } from "@manent/pagination";

/** `text_and_elements`: marks and every attribute but `type` are ignored. */
export type CompareMode = "full" | "text_and_elements";

/** Why a comparison is on text and elements only: a newer build wrote one side, or the layout engines differ. */
export type CompareNote = "newer" | "engines";

/**
 * Full unless the schema versions differ ("newer") or, failing that, the
 * engine versions do ("engines"); a null engine version reads as
 * ENGINE_VERSION.
 */
export function compareModeOf(
  a: { schemaVersion: number; engineVersion: number | null },
  b: { schemaVersion: number; engineVersion: number | null },
): { mode: CompareMode; note: CompareNote | null } {
  if (a.schemaVersion !== b.schemaVersion)
    return { mode: "text_and_elements", note: "newer" };
  if (
    (a.engineVersion ?? ENGINE_VERSION) !== (b.engineVersion ?? ENGINE_VERSION)
  )
    return { mode: "text_and_elements", note: "engines" };
  return { mode: "full", note: null };
}
