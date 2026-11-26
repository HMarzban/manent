// Workspace MOS configuration and per-rundown opt-in persistence and authorization (ADR 0073).
import { MOS_DIALECTS } from "@manent/formats";
import type { MosDialect } from "@manent/formats";
import type { Storage } from "@manent/storage";
import { indexDocId, isDocId, isWorkspaceId } from "@manent/sync-protocol";
import { isIP } from "node:net";
import { createRundownChain } from "../prompter/send-trail.ts";
import type { SyncService } from "../sync/ports.ts";
import { isIpAllowed, isValidMosPort, validateCidrs } from "./allowlist.ts";

export const MOS_DEFAULT_LOWER_PORT = 10540;
export const MOS_DEFAULT_UPPER_PORT = 10541;
export const MOS_DEFAULT_NCS_ID = "manent.ncs";
export const MOS_DEFAULT_MOS_ID = "prompter.studio";

const WORKSPACE_SETTING_KEY = "broadcast.mos";
const RUNDOWN_OPTIN_NAMESPACE = "__mos_rundowns__";
const MAX_ID_LENGTH = 128;
const HOST_BAD = /[\s/@?#\\]/;

export interface MosWorkspaceConfig {
  readonly dialect: MosDialect;
  readonly host: string;
  readonly lowerPort: number;
  readonly upperPort: number;
  readonly ncsId: string;
  readonly mosId: string;
  readonly allowedCidrs: readonly string[];
  readonly enabled: boolean;
}

export interface MosRundownOptIn {
  readonly docId: string;
  readonly workspaceId: string;
  readonly enabled: boolean;
  readonly roSlug: string;
}

export type MosConfigRefusal =
  "bad_request" | "forbidden" | "not_found" | "deleted" | "host_not_allowed";

export type MosConfigOutcome<T> =
  { ok: true; value: T } | { ok: false; code: MosConfigRefusal };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isDialect = (v: unknown): v is MosDialect =>
  typeof v === "string" && (MOS_DIALECTS as readonly string[]).includes(v);

const isMosName = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= MAX_ID_LENGTH;

export function parseMosWorkspaceConfig(
  raw: unknown,
):
  | { ok: true; config: MosWorkspaceConfig }
  | { ok: false; code: "bad_request" | "host_not_allowed" } {
  if (!isRecord(raw)) return { ok: false, code: "bad_request" };
  const dialect = raw.dialect ?? "autoscript_winplus_ip";
  const host = typeof raw.host === "string" ? raw.host.trim() : "";
  const lowerPort = raw.lowerPort ?? MOS_DEFAULT_LOWER_PORT;
  const upperPort = raw.upperPort ?? MOS_DEFAULT_UPPER_PORT;
  const ncsId = raw.ncsId ?? MOS_DEFAULT_NCS_ID;
  const mosId = raw.mosId ?? MOS_DEFAULT_MOS_ID;
  const allowedCidrsRaw = raw.allowedCidrs ?? [];
  const enabled = raw.enabled ?? true;
  if (
    !isDialect(dialect) ||
    host.length === 0 ||
    host.length > 253 ||
    HOST_BAD.test(host) ||
    typeof lowerPort !== "number" ||
    !isValidMosPort(lowerPort) ||
    typeof upperPort !== "number" ||
    !isValidMosPort(upperPort) ||
    !isMosName(ncsId) ||
    !isMosName(mosId) ||
    !Array.isArray(allowedCidrsRaw) ||
    !allowedCidrsRaw.every((c): c is string => typeof c === "string") ||
    !validateCidrs(allowedCidrsRaw) ||
    typeof enabled !== "boolean"
  )
    return { ok: false, code: "bad_request" };

  const allowedCidrs = allowedCidrsRaw.map((c) => c.trim());
  const unwrapped =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(unwrapped) !== 0 && !isIpAllowed(unwrapped, allowedCidrs))
    return { ok: false, code: "host_not_allowed" };

  return {
    ok: true,
    config: {
      dialect,
      host,
      lowerPort,
      upperPort,
      ncsId: ncsId.trim(),
      mosId: mosId.trim(),
      allowedCidrs,
      enabled,
    },
  };
}

export function resolveCheckConfig(
  saved: MosWorkspaceConfig | null,
  overrideRaw: unknown,
):
  | { ok: true; config: MosWorkspaceConfig }
  | { ok: false; reason: "bad_host" | "host_not_allowed" | "not_configured" } {
  if (
    typeof overrideRaw === "object" &&
    overrideRaw !== null &&
    Object.keys(overrideRaw).length > 0
  ) {
    const parsed = parseMosWorkspaceConfig(overrideRaw);
    if (!parsed.ok)
      return {
        ok: false,
        reason:
          parsed.code === "host_not_allowed" ? "host_not_allowed" : "bad_host",
      };
    return { ok: true, config: parsed.config };
  }
  return saved === null
    ? { ok: false, reason: "not_configured" }
    : { ok: true, config: saved };
}

export interface MosConfigStore {
  readWorkspace(workspaceId: string): MosWorkspaceConfig | null;
  getWorkspace(
    callerUserId: string,
    workspaceId: string,
  ): Promise<MosConfigOutcome<MosWorkspaceConfig | null>>;
  saveWorkspace(
    callerUserId: string,
    workspaceId: string,
    raw: unknown,
  ): Promise<MosConfigOutcome<MosWorkspaceConfig>>;
  deleteWorkspace(
    callerUserId: string,
    workspaceId: string,
  ): Promise<MosConfigOutcome<{ removed: boolean }>>;
  readRundownOptIn(docId: string): MosRundownOptIn | null;
  listEnabledRundowns(): MosRundownOptIn[];
  getRundownOptIn(
    callerUserId: string,
    docId: string,
  ): Promise<MosConfigOutcome<MosRundownOptIn>>;
  setRundownOptIn(
    callerUserId: string,
    docId: string,
    input: { workspaceId: string; enabled: boolean; roSlug?: string },
  ): Promise<MosConfigOutcome<MosRundownOptIn>>;
}

export function createMosConfigStore(options: {
  storage: Storage;
  sync: () => SyncService;
}): MosConfigStore {
  const { storage, sync } = options;
  const inChain = createRundownChain();

  function readWorkspace(workspaceId: string): MosWorkspaceConfig | null {
    const row = storage.workspace.get(workspaceId, WORKSPACE_SETTING_KEY);
    if (row === null) return null;
    try {
      const parsed = parseMosWorkspaceConfig(JSON.parse(row.value));
      return parsed.ok ? parsed.config : null;
    } catch {
      return null;
    }
  }

  function readRundownOptIn(docId: string): MosRundownOptIn | null {
    const row = storage.workspace.get(RUNDOWN_OPTIN_NAMESPACE, docId);
    if (row === null) return null;
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (
        !isRecord(parsed) ||
        typeof parsed.workspaceId !== "string" ||
        typeof parsed.enabled !== "boolean" ||
        typeof parsed.roSlug !== "string"
      )
        return null;
      return {
        docId,
        workspaceId: parsed.workspaceId,
        enabled: parsed.enabled,
        roSlug: parsed.roSlug,
      };
    } catch {
      return null;
    }
  }

  function checkWorkspaceRole(
    callerUserId: string,
    workspaceId: string,
    ownerOnly: boolean,
  ): MosConfigRefusal | null {
    if (!isWorkspaceId(workspaceId)) return "bad_request";
    const role = storage.directory.roleOf(
      indexDocId("workspace", workspaceId),
      callerUserId,
    );
    if (role === null) return "forbidden";
    if (ownerOnly && role.role !== "owner") return "forbidden";
    return null;
  }

  return {
    readWorkspace,
    getWorkspace(callerUserId, workspaceId) {
      return inChain(`ws:${workspaceId}`, async () => {
        const err = checkWorkspaceRole(callerUserId, workspaceId, false);
        if (err !== null) return { ok: false, code: err };
        return { ok: true, value: readWorkspace(workspaceId) };
      });
    },
    saveWorkspace(callerUserId, workspaceId, raw) {
      return inChain(`ws:${workspaceId}`, async () => {
        const err = checkWorkspaceRole(callerUserId, workspaceId, true);
        if (err !== null) return { ok: false, code: err };
        const parsed = parseMosWorkspaceConfig(raw);
        if (!parsed.ok) return { ok: false, code: parsed.code };
        storage.workspace.set(
          workspaceId,
          WORKSPACE_SETTING_KEY,
          JSON.stringify(parsed.config),
          callerUserId,
        );
        return { ok: true, value: parsed.config };
      });
    },
    deleteWorkspace(callerUserId, workspaceId) {
      return inChain(`ws:${workspaceId}`, async () => {
        const err = checkWorkspaceRole(callerUserId, workspaceId, true);
        if (err !== null) return { ok: false, code: err };
        const removed = storage.workspace.remove(
          workspaceId,
          WORKSPACE_SETTING_KEY,
        );
        return { ok: true, value: { removed } };
      });
    },
    readRundownOptIn,
    listEnabledRundowns() {
      const out: MosRundownOptIn[] = [];
      for (const row of storage.workspace.list(RUNDOWN_OPTIN_NAMESPACE)) {
        const opt = readRundownOptIn(row.key);
        if (opt !== null && opt.enabled) out.push(opt);
      }
      return out;
    },
    getRundownOptIn(callerUserId, docId) {
      if (!isDocId(docId))
        return Promise.resolve({ ok: false, code: "bad_request" });
      return inChain(docId, async () => {
        if (storage.directory.tombstoneOf(docId) !== null)
          return { ok: false, code: "deleted" };
        const resolved = sync().access.resolve(callerUserId, docId);
        if (!resolved.ok)
          return {
            ok: false,
            code: resolved.code === "deleted" ? "deleted" : "forbidden",
          };
        const place = storage.directory.placeOf(docId);
        if (place === null || place.kind !== "rundown")
          return { ok: false, code: "not_found" };
        const existing = readRundownOptIn(docId);
        return {
          ok: true,
          value: existing ?? {
            docId,
            workspaceId: "",
            enabled: false,
            roSlug: "",
          },
        };
      });
    },
    setRundownOptIn(callerUserId, docId, input) {
      if (
        !isDocId(docId) ||
        !isWorkspaceId(input.workspaceId) ||
        typeof input.enabled !== "boolean"
      )
        return Promise.resolve({ ok: false, code: "bad_request" });
      return inChain(docId, async () => {
        if (storage.directory.tombstoneOf(docId) !== null)
          return { ok: false, code: "deleted" };
        const wsErr = checkWorkspaceRole(
          callerUserId,
          input.workspaceId,
          false,
        );
        if (wsErr !== null) return { ok: false, code: wsErr };
        // Re-check BOTH edit_rundowns and send_to_prompter strictly inside inChain!
        const caps = sync().access.capabilitiesOf(callerUserId, docId);
        if (
          caps === null ||
          !caps.includes("edit_rundowns") ||
          !caps.includes("send_to_prompter")
        )
          return { ok: false, code: "forbidden" };
        const place = storage.directory.placeOf(docId);
        if (place === null || place.kind !== "rundown")
          return { ok: false, code: "not_found" };
        const prev = readRundownOptIn(docId);
        const next: MosRundownOptIn = {
          docId,
          workspaceId: input.workspaceId,
          enabled: input.enabled,
          roSlug: input.roSlug ?? prev?.roSlug ?? docId,
        };
        storage.workspace.set(
          RUNDOWN_OPTIN_NAMESPACE,
          docId,
          JSON.stringify(next),
          callerUserId,
        );
        return { ok: true, value: next };
      });
    },
  };
}
