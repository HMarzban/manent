// One-click offline backup of every locally cached project in this browser into one downloadable .zip archive.
import { formatDate } from "@manent/ui";
import type { WrittenFile } from "../send/script-file.ts";
import type { PersonServices, ProjectItem } from "../services/ports.ts";

const ZIP_EXTENSION = ".zip";
const NAME_LIMIT = 200;
const REFUSED_IN_NAME = new RegExp('[/\\\\:*?"<>|]', "g");
const UTF8_FLAG = 0x0800;

export type BrowserBackupOutcome =
  | { readonly kind: "exported"; readonly count: number; readonly name: string }
  | { readonly kind: "empty" }
  | { readonly kind: "refused" };

interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

interface BackupProject {
  readonly projectId: string;
  readonly firstDocId: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1)
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1)
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(at: number): {
  readonly time: number;
  readonly date: number;
} {
  const d = new Date(at);
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time =
    (d.getHours() << 11) |
    (d.getMinutes() << 5) |
    Math.floor(d.getSeconds() / 2);
  return { time, date };
}

/** Builds a valid STORE (uncompressed) ZIP archive from `entries`, ideal for bundling compressed project zips offline. */
export function buildStoreZip(
  entries: readonly ZipEntry[],
  at: number,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const { time, date } = dosTimestamp(at);
  const prepared = entries.map((entry) => ({
    nameBytes: encoder.encode(entry.name),
    data: entry.bytes,
    crc: crc32(entry.bytes),
    offset: 0,
  }));

  let localSize = 0;
  let centralSize = 0;
  for (const item of prepared) {
    item.offset = localSize;
    localSize += 30 + item.nameBytes.length + item.data.length;
    centralSize += 46 + item.nameBytes.length;
  }
  const totalSize = localSize + centralSize + 22;
  const out = new Uint8Array(new ArrayBuffer(totalSize));
  const view = new DataView(out.buffer);

  let pos = 0;
  for (const item of prepared) {
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, UTF8_FLAG, true);
    view.setUint16(pos + 8, 0, true);
    view.setUint16(pos + 10, time, true);
    view.setUint16(pos + 12, date, true);
    view.setUint32(pos + 14, item.crc, true);
    view.setUint32(pos + 18, item.data.length, true);
    view.setUint32(pos + 22, item.data.length, true);
    view.setUint16(pos + 26, item.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);
    pos += 30;
    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;
    out.set(item.data, pos);
    pos += item.data.length;
  }

  const centralOffset = pos;
  for (const item of prepared) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, UTF8_FLAG, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, time, true);
    view.setUint16(pos + 14, date, true);
    view.setUint32(pos + 16, item.crc, true);
    view.setUint32(pos + 20, item.data.length, true);
    view.setUint32(pos + 24, item.data.length, true);
    view.setUint16(pos + 28, item.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, item.offset, true);
    pos += 46;
    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;
  }

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, centralSize, true);
  view.setUint32(pos + 16, centralOffset, true);
  view.setUint16(pos + 20, 0, true);

  return out;
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

function backupFileName(at: number): string {
  const year = new Date(at).getFullYear();
  return `Manent export ${formatDate(at)} ${year}${ZIP_EXTENSION}`;
}

async function discoverCachedProjects(
  services: Pick<PersonServices, "api" | "userId" | "library">,
): Promise<readonly BackupProject[]> {
  const me = await services.api
    .me()
    .catch(() => ({ ok: false as const, reason: "unreachable" as const }));
  const listed = me.ok
    ? me.me.workspaces.filter((ws) => ws.seeding === null).map((ws) => ws.id)
    : [];
  const workspaceIds = new Set([...listed, services.userId]);
  const seen = new Set<string>();
  const found: BackupProject[] = [];
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
 * Zips every locally cached project (scripts, drafts, and assets) in this browser into one downloadable `.zip`.
 * Lazily imports project archive and download helpers so `@manent/formats` stays out of the entry chunk.
 */
export async function backupEverythingInBrowser(options: {
  readonly services: PersonServices;
  readonly now: () => number;
  readonly onCount?: (count: number) => void;
  readonly writeProject?: (
    services: PersonServices,
    docId: string,
    now: () => number,
  ) => Promise<WrittenFile>;
  readonly download?: (
    bytes: Uint8Array<ArrayBuffer>,
    name: string,
    type: string,
  ) => void;
}): Promise<BrowserBackupOutcome> {
  const { services, now, onCount } = options;
  try {
    const projects = await discoverCachedProjects(services);
    if (projects.length === 0) return { kind: "empty" };
    onCount?.(projects.length);
    const writeProject =
      options.writeProject ??
      (await import("../archive/project-archive.ts")).writeProjectArchive;
    const download =
      options.download ?? (await import("../send/script-file.ts")).save;
    const usedNames = new Set<string>(["manifest.json"]);
    const entries: ZipEntry[] = [];
    const manifestProjects: {
      readonly projectId: string;
      readonly file: string;
      readonly byteLength: number;
    }[] = [];
    for (const project of projects) {
      let archive: WrittenFile;
      try {
        archive = await writeProject(services, project.firstDocId, now);
      } catch {
        continue;
      }
      const file = uniqueZipName(archive.name, usedNames);
      entries.push({ name: file, bytes: archive.bytes });
      manifestProjects.push({
        projectId: project.projectId,
        file,
        byteLength: archive.bytes.byteLength,
      });
    }
    if (entries.length === 0) return { kind: "empty" };
    const exportedAt = now();
    const manifestBytes = new TextEncoder().encode(
      JSON.stringify({ v: 1, exportedAt, projects: manifestProjects }, null, 2),
    );
    const allEntries: ZipEntry[] = [
      { name: "manifest.json", bytes: manifestBytes },
      ...entries,
    ];
    const zipBytes = buildStoreZip(allEntries, exportedAt);
    const name = backupFileName(exportedAt);
    download(zipBytes, name, "application/zip");
    return { kind: "exported", count: entries.length, name };
  } catch {
    return { kind: "refused" };
  }
}
