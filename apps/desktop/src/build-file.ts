// Reads the packaged build.json beside the desktop app: its release repository and protocol/schema versions.
import { readFileSync } from "node:fs";
import type { ServerVersions } from "@manent/sync-protocol";

/** What the build packs beside the app: the repository its releases come from, and the versions it runs. */
export interface BuildFile {
  repository: string;
  versions: ServerVersions;
}

const VERSION_FIELDS = ["protocol", "schema", "engine", "table"] as const;

function isVersionSet(value: unknown): value is ServerVersions["current"] {
  if (typeof value !== "object" || value === null) return false;
  const fields: Record<string, unknown> = { ...value };
  return VERSION_FIELDS.every((f) => {
    const v = fields[f];
    return Number.isSafeInteger(v) && Number(v) >= 0;
  });
}

/** Throws when the build packed no readable build.json: the app cannot run without one. */
export function readBuildFile(path: string): BuildFile {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    typeof value !== "object" ||
    value === null ||
    !("repository" in value) ||
    !("versions" in value) ||
    typeof value.repository !== "string" ||
    !isVersionSet(value.versions)
  )
    throw new TypeError(`${path} is not a build file`);
  return {
    repository: value.repository,
    versions: { current: value.versions, min: value.versions },
  };
}
