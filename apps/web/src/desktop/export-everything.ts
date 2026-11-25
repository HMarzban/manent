// "Export everything on this device…": asks the desktop shell for a folder, builds each project's zip sequentially
// through the one project archive writer, and writes each file via the local node's authenticated export route.
import { formatDate } from "@manent/ui";
import type { PersonServices, ProjectItem } from "../services/ports.ts";
import type { DesktopHost } from "./host.ts";

const ZIP_EXTENSION = ".zip";
const NAME_LIMIT = 200;
const BASE64_CHUNK = 8192;
const REFUSED_IN_NAME = new RegExp('[/\\\\:*?"<>|]', "g");
const noop = (): void => {};

type ExportEverythingOutcome =
  | { readonly kind: "cancelled" }
  | {
      readonly kind: "exported";
      readonly count: number;
      readonly folder: string;
    }
  | { readonly kind: "refused" };

/** Subfolder name for an export at `at`: "Manent export 17 Nov 2026". */
function exportSubfolderName(at: number): string {
  const year = new Date(at).getFullYear();
  return `Manent export ${formatDate(at)} ${year}`;
}

function stripControlChars(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0x1f && code !== 0x7f) out += value[i];
  }
  return out;
}

function uniqueZipName(suggested: string, usedLower: Set<string>): string {
  const withoutExt = suggested.endsWith(ZIP_EXTENSION)
    ? suggested.slice(0, -ZIP_EXTENSION.length)
    : suggested;
  const cleaned = stripControlChars(withoutExt)
    .replace(REFUSED_IN_NAME, "-")
    .trim();
  const base =
    cleaned.length === 0 || cleaned === "." || cleaned === ".."
      ? "Untitled"
      : cleaned;
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? ZIP_EXTENSION : ` (${index})${ZIP_EXTENSION}`;
    const trimmedBase = [...base].slice(0, NAME_LIMIT - suffix.length).join("");
    const candidate = `${trimmedBase}${suffix}`;
    const key = candidate.toLowerCase();
    if (!usedLower.has(key)) {
      usedLower.add(key);
      return candidate;
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Asks the desktop shell for a destination folder; null when the person cancels or `signal` aborts. */
function chooseDirectory(
  host: DesktopHost,
  signal: AbortSignal,
): Promise<string | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let stopHearing: () => void = noop;
    const finish = (path: string | null): void => {
      if (settled) return;
      settled = true;
      stopHearing();
      signal.removeEventListener("abort", onAbort);
      resolve(path);
    };
    const onAbort = (): void => finish(null);
    signal.addEventListener("abort", onAbort, { once: true });
    stopHearing = host.onMessage((message) => {
      if (message.t === "directory_chosen") finish(message.path);
    });
    host.send({ v: 1, t: "choose_directory" });
  });
}

interface ExportableProject {
  readonly projectId: string;
  readonly firstDocId: string;
}

/** Non-trashed projects held on this device across all workspaces the person belongs to plus their own desk. */
async function discoverProjects(
  services: PersonServices,
): Promise<readonly ExportableProject[]> {
  const me = await services.api.me();
  const listed = me.ok
    ? me.me.workspaces.filter((ws) => ws.seeding === null).map((ws) => ws.id)
    : [];
  const workspaceIds = new Set([...listed, services.userId]);
  const seen = new Set<string>();
  const found: ExportableProject[] = [];
  for (const workspaceId of workspaceIds) {
    let projects: readonly ProjectItem[];
    try {
      projects = await services.library.readProjects(workspaceId);
    } catch {
      continue;
    }
    for (const project of projects) {
      if (seen.has(project.projectId)) continue;
      if (project.firstDocId === null) continue;
      if (project.place.kind === "not_on_device") continue;
      seen.add(project.projectId);
      found.push({
        projectId: project.projectId,
        firstDocId: project.firstDocId,
      });
    }
  }
  return found;
}

/**
 * Runs the "Export everything on this device…" flow: asks the shell for a folder, discovers every non-trashed
 * project on this device, builds one `.zip` archive at a time via `writeProjectArchive`, and posts each to
 * `POST /api/local/export-file`.
 */
export async function exportEverythingOnDevice(options: {
  readonly host: DesktopHost;
  readonly services: PersonServices;
  readonly token: string | null;
  readonly now: () => number;
  readonly signal: AbortSignal;
  readonly onCount: (count: number) => void;
}): Promise<ExportEverythingOutcome> {
  const { host, services, token, now, signal, onCount } = options;
  const folder = await chooseDirectory(host, signal);
  if (folder === null || signal.aborted) return { kind: "cancelled" };
  try {
    const projects = await discoverProjects(services);
    if (projects.length === 0) return { kind: "refused" };
    onCount(projects.length);
    const subfolder = exportSubfolderName(now());
    const { writeProjectArchive } =
      await import("../archive/project-archive.ts");
    const usedNames = new Set<string>();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token !== null) headers["Authorization"] = `Bearer ${token}`;
    for (const project of projects) {
      if (signal.aborted) return { kind: "cancelled" };
      const archive = await writeProjectArchive(
        services,
        project.firstDocId,
        now,
      );
      const name = uniqueZipName(archive.name, usedNames);
      const response = await fetch("/api/local/export-file", {
        method: "POST",
        headers,
        body: JSON.stringify({
          folder,
          subfolder,
          name,
          bytes: bytesToBase64(archive.bytes),
        }),
      });
      if (!response.ok) return { kind: "refused" };
    }
    return { kind: "exported", count: projects.length, folder: subfolder };
  } catch {
    return { kind: "refused" };
  }
}
