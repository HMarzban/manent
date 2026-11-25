// Authenticated atomic zip writer for "Export everything on this device…" (POST /api/local/export-file).
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { OPENED_FILE_LIMIT_BYTES } from "@manent/sync-protocol";
import type { ErrorResponse, HttpErrorCode } from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import type { LocalRoute, LocalRouteContext } from "../http/local-routes.ts";

const BASE64 = new RegExp(
  "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
);

function isBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64.test(value);
}

const FOLDER_LIMIT = 4096;
const SUBFOLDER_LIMIT = 120;
const NAME_LIMIT = 200;
const ZIP_EXTENSION = ".zip";
const MAX_DECODED_BYTES = OPENED_FILE_LIMIT_BYTES * 8;
const MAX_BASE64_CHARS = Math.ceil(MAX_DECODED_BYTES / 3) * 4;
const TEMP_SUFFIX = ".manent-tmp";
const FILE_MODE = 0o600;
const NO_FOLLOW =
  typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;

interface ExportFileBody {
  folder: string;
  subfolder: string;
  name: string;
  bytes: string;
}

const failure = (code: HttpErrorCode, status: number): Response =>
  Response.json({ error: code } satisfies ErrorResponse, { status });

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isSafeSegment(value: string, limit: number): boolean {
  if (value.length === 0 || value.length > limit) return false;
  if (value === "." || value === "..") return false;
  if (value.includes("/") || value.includes("\\")) return false;
  return !hasControlChar(value);
}

function isExistingDirectory(folder: string): boolean {
  if (folder.length === 0 || folder.length > FOLDER_LIMIT) return false;
  if (hasControlChar(folder) || !isAbsolute(folder)) return false;
  try {
    return statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

function decodedBase64Length(encoded: string): number {
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
}

function readExportFileBody(
  raw: unknown,
):
  | { ok: true; value: ExportFileBody }
  | { ok: false; status: number; code: HttpErrorCode } {
  if (typeof raw !== "object" || raw === null)
    return { ok: false, status: 400, code: "bad_request" };
  if (!(
    "folder" in raw &&
    "subfolder" in raw &&
    "name" in raw &&
    "bytes" in raw
  ))
    return { ok: false, status: 400, code: "bad_request" };
  const { folder, subfolder, name, bytes } = raw;
  if (
    typeof folder !== "string" ||
    typeof subfolder !== "string" ||
    typeof name !== "string" ||
    typeof bytes !== "string"
  )
    return { ok: false, status: 400, code: "bad_request" };
  if (!isExistingDirectory(folder))
    return { ok: false, status: 400, code: "bad_request" };
  if (!isSafeSegment(subfolder, SUBFOLDER_LIMIT))
    return { ok: false, status: 400, code: "bad_request" };
  if (
    !isSafeSegment(name, NAME_LIMIT) ||
    !name.endsWith(ZIP_EXTENSION) ||
    name.length <= ZIP_EXTENSION.length
  )
    return { ok: false, status: 400, code: "bad_request" };
  if (bytes.length > MAX_BASE64_CHARS)
    return { ok: false, status: 413, code: "too_large" };
  if (!isBase64(bytes)) return { ok: false, status: 400, code: "bad_request" };
  if (decodedBase64Length(bytes) > MAX_DECODED_BYTES)
    return { ok: false, status: 413, code: "too_large" };
  return { ok: true, value: { folder, subfolder, name, bytes } };
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function writeAtomically(
  folder: string,
  subfolder: string,
  name: string,
  decoded: Uint8Array,
): boolean {
  const baseDir = resolve(folder);
  const targetDir = resolve(baseDir, subfolder);
  const targetPath = resolve(targetDir, name);
  if (
    targetDir !== join(baseDir, subfolder) ||
    targetPath !== join(targetDir, name)
  )
    return false;
  const tempPath = join(targetDir, `.${name}${TEMP_SUFFIX}`);
  let fd: number | null = null;
  try {
    const existingDir = lstatOrNull(targetDir);
    if (existingDir !== null) {
      if (existingDir.isSymbolicLink() || !existingDir.isDirectory())
        return false;
    } else {
      mkdirSync(targetDir, { recursive: true });
    }
    const existingTarget = lstatOrNull(targetPath);
    if (
      existingTarget !== null &&
      (existingTarget.isSymbolicLink() || existingTarget.isDirectory())
    )
      return false;
    fd = openSync(
      tempPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NO_FOLLOW,
      FILE_MODE,
    );
    let offset = 0;
    while (offset < decoded.byteLength) {
      offset += writeSync(fd, decoded, offset, decoded.byteLength - offset);
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tempPath, targetPath);
    return true;
  } catch {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore close failure during cleanup
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore missing temp file during cleanup
    }
    return false;
  }
}

/** Local route for writing exported project archives into a chosen directory. */
export function exportFilesRoutes(
  context: LocalRouteContext,
): Record<string, LocalRoute> {
  return {
    async "POST /api/local/export-file"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      const parsed = readExportFileBody(await request.json().catch(() => null));
      if (!parsed.ok) return failure(parsed.code, parsed.status);
      const { folder, subfolder, name, bytes } = parsed.value;
      const decoded = Uint8Array.fromBase64(bytes);
      if (!writeAtomically(folder, subfolder, name, decoded))
        return failure("unreachable", 500);
      return new Response(null, { status: 204 });
    },
  };
}
