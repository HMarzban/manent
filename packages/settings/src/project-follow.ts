// What a script follows from its project while page numbers are unlocked.
import { SETTINGS } from "./settings.ts";

/** Each script setting followed from a project, mapped to its project twin. */
export const FOLLOWED_SCRIPT_KEYS: Readonly<Record<string, string>> =
  Object.freeze({
    "script.header": "project.header",
    "script.footer": "project.footer",
    "script.dateFormat": "project.dateFormat",
    "script.numbering": "project.numbering",
    "script.colourOrder": "project.colourOrder",
    "script.style": "project.style",
  });

const SCRIPT_BY_PROJECT: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(FOLLOWED_SCRIPT_KEYS).map(([scriptKey, projectKey]) => [
      projectKey,
      scriptKey,
    ]),
  ),
);

/** The project setting key that `scriptKey` follows while unlocked; null for any other key. */
export function projectTwinOf(scriptKey: string): string | null {
  return Object.hasOwn(FOLLOWED_SCRIPT_KEYS, scriptKey)
    ? (FOLLOWED_SCRIPT_KEYS[scriptKey] ?? null)
    : null;
}

/** The script setting key that follows `projectKey`; null for any other key. */
export function scriptTwinOf(projectKey: string): string | null {
  return Object.hasOwn(SCRIPT_BY_PROJECT, projectKey)
    ? (SCRIPT_BY_PROJECT[projectKey] ?? null)
    : null;
}

function parsedProjectValue(
  scriptKey: string,
  projectKey: string,
  project: Readonly<Record<string, unknown>> | null,
): { ok: true; value: unknown } | { ok: false } {
  if (project === null || !Object.hasOwn(project, projectKey))
    return { ok: false };
  const def = SETTINGS.all.find((held) => held.key === scriptKey);
  if (def === undefined) return { ok: false };
  const parsed = def.type.parse(project[projectKey]);
  if (!parsed.ok) return { ok: false };
  // An empty element-style map leaves every element as the format sets it, so it does not override the script.
  if (
    projectKey === "project.style" &&
    typeof parsed.value === "object" &&
    parsed.value !== null &&
    Object.keys(parsed.value).length === 0
  )
    return { ok: false };
  return { ok: true, value: parsed.value };
}

/** True when `project` holds a valid, active value for `projectKey` (an empty `project.style` counts as unset). */
export function isFollowedProjectKeySet(
  projectKey: string,
  project: Readonly<Record<string, unknown>> | null,
): boolean {
  const scriptKey = scriptTwinOf(projectKey);
  return (
    scriptKey !== null && parsedProjectValue(scriptKey, projectKey, project).ok
  );
}

/**
 * Resolves `script`'s followed settings against `project` while page numbers are unlocked: each followed key
 * reads `project`'s twin only once `project` has set a valid value for it; otherwise `script`'s own entry stays.
 */
export function resolveFollowed(
  script: Readonly<Record<string, unknown>>,
  project: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> {
  const resolved: Record<string, unknown> = { ...script };
  for (const [scriptKey, projectKey] of Object.entries(FOLLOWED_SCRIPT_KEYS)) {
    const entry = parsedProjectValue(scriptKey, projectKey, project);
    if (entry.ok) resolved[scriptKey] = entry.value;
  }
  return Object.freeze(resolved);
}
