// Local-node HTTP routes under `/api/local/mos` for starting, checking and stopping the desktop LAN MOS relay.
import {
  MOS_DEFAULT_MOS_ID,
  MOS_DEFAULT_NCS_ID,
  MOS_DEFAULT_UPPER_PORT,
  checkMosHandshake,
  isValidMosPort,
  resolvePinnedTarget,
  validateCidrs,
} from "@manent/server-core";
import type { DnsLookupFn, MosLinkStatus } from "@manent/server-core";
import type { Clock } from "@manent/sync-client";
import { isDocId } from "@manent/sync-protocol";
import type { ErrorResponse, HttpErrorCode } from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import type { LocalRoute, LocalRouteContext } from "../http/local-routes.ts";
import { feedFromPrompterHandle } from "../prompter-files/writer.ts";
import { createMosLanRelay } from "./lan-relay.ts";
import type {
  MosLanDialect,
  MosLanRelayConfig,
  MosLanRelayStatus,
} from "./lan-relay.ts";

const failure = (code: HttpErrorCode, status: number): Response =>
  Response.json({ error: code } satisfies ErrorResponse, { status });

const noContent = (): Response => new Response(null, { status: 204 });

function parseCidrs(raw: unknown): readonly string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  if (!raw.every((c): c is string => typeof c === "string")) return null;
  return validateCidrs(raw) ? raw : null;
}

function parseUpperPort(raw: unknown): number | null {
  if (raw === undefined) return MOS_DEFAULT_UPPER_PORT;
  return typeof raw === "number" && isValidMosPort(raw) ? raw : null;
}

function parseStartBody(body: unknown): MosLanRelayConfig | null {
  if (typeof body !== "object" || body === null) return null;
  const rec = body as Record<string, unknown>;
  if (!isDocId(rec.rundownId)) return null;
  const host = typeof rec.host === "string" ? rec.host.trim() : "";
  if (host === "" || host.length > 255) return null;
  const upperPort = parseUpperPort(rec.upperPort);
  if (upperPort === null) return null;
  const dialect: MosLanDialect =
    rec.dialect === "mos_2_8_5" ? "mos_2_8_5" : "autoscript_winplus_ip";
  const mosId =
    typeof rec.mosId === "string" && rec.mosId.trim() !== ""
      ? rec.mosId.trim()
      : MOS_DEFAULT_MOS_ID;
  const ncsId =
    typeof rec.ncsId === "string" && rec.ncsId.trim() !== ""
      ? rec.ncsId.trim()
      : MOS_DEFAULT_NCS_ID;
  const roSlug =
    typeof rec.roSlug === "string" && rec.roSlug.trim() !== ""
      ? rec.roSlug.trim()
      : rec.rundownId;
  const allowedCidrs = parseCidrs(rec.allowedCidrs);
  if (allowedCidrs === null) return null;
  return {
    rundownId: rec.rundownId,
    roSlug,
    host,
    upperPort,
    mosId,
    ncsId,
    dialect,
    allowedCidrs,
  };
}

/** Registers optional desktop LAN MOS relay routes under `/api/local/mos` on the local node. */
export function mosLanRelayRoutes(
  context: LocalRouteContext,
  options?: { readonly lookup?: DnsLookupFn; readonly clock?: Clock },
): Record<string, LocalRoute> {
  const clock = options?.clock ?? context.clock;
  let active: {
    readonly config: MosLanRelayConfig;
    readonly status: () => MosLinkStatus;
    readonly stop: () => Promise<void>;
  } | null = null;

  const stopActive = (): Promise<void> => {
    const cur = active;
    active = null;
    return cur === null ? Promise.resolve() : cur.stop();
  };

  context.onClose(() => {
    void stopActive();
  });

  return {
    "GET /api/local/mos"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      if (active === null) return Response.json(null);
      return Response.json({
        ...active.config,
        status: active.status(),
      } satisfies MosLanRelayStatus);
    },

    async "DELETE /api/local/mos"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      await stopActive();
      return noContent();
    },

    async "POST /api/local/mos/check"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      const body: unknown = await request.json().catch(() => null);
      if (typeof body !== "object" || body === null)
        return failure("bad_request", 400);
      const rec = body as Record<string, unknown>;
      const host = typeof rec.host === "string" ? rec.host.trim() : "";
      const upperPort = parseUpperPort(rec.upperPort);
      const allowedCidrs = parseCidrs(rec.allowedCidrs);
      if (host === "" || upperPort === null || allowedCidrs === null)
        return failure("bad_request", 400);
      const pinned = await resolvePinnedTarget(host, upperPort, {
        allowedCidrs,
        lookup: options?.lookup,
      });
      if (!pinned.ok) return Response.json({ ok: false, reason: pinned.code });
      const result = await checkMosHandshake({
        target: pinned,
        mosId:
          typeof rec.mosId === "string" && rec.mosId.trim() !== ""
            ? rec.mosId.trim()
            : MOS_DEFAULT_MOS_ID,
        ncsId:
          typeof rec.ncsId === "string" && rec.ncsId.trim() !== ""
            ? rec.ncsId.trim()
            : MOS_DEFAULT_NCS_ID,
        nowIso: new Date(clock.now()).toISOString(),
      });
      return Response.json(result);
    },

    async "POST /api/local/mos"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      const parsed = parseStartBody(await request.json().catch(() => null));
      if (parsed === null) return failure("bad_request", 400);
      if (active !== null && active.config.rundownId !== parsed.rundownId)
        return failure("busy", 409);
      const client = context.clientOf(person.userId);
      if (client === null) return failure("unreachable", 503);

      await stopActive();
      const handle = client.prompter(parsed.rundownId);
      const started = await createMosLanRelay({
        config: parsed,
        feed: feedFromPrompterHandle(handle),
        lookup: options?.lookup,
      });
      if (!started.ok) {
        handle.close();
        return Response.json({ error: started.reason }, { status: 400 });
      }
      let closed = false;
      const run = {
        config: parsed,
        status: started.status,
        async stop() {
          if (closed) return;
          closed = true;
          offRefused();
          handle.close();
          await started.stop();
        },
      };
      const offRefused = handle.status.subscribe((st) => {
        if (st.feed !== "refused") return;
        if (active === run) active = null;
        void run.stop();
      });
      active = run;
      return Response.json({
        ...parsed,
        status: run.status(),
      } satisfies MosLanRelayStatus);
    },
  };
}
