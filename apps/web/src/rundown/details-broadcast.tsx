// Details → Rundown broadcast MOS toggle: per-rundown opt-in gated by edit_rundowns + send_to_prompter (ADR 0073).
import { indexDocId } from "@manent/sync-protocol";
import { BROADCAST_MOS_WORDS, Label, Switch } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";
import { liveMap } from "../services/sync/private-index.ts";
import { readPerson } from "../session.ts";

type MosLinkStatus = "off" | "waiting" | "live" | "lost";

interface RundownBroadcastState {
  readonly workspaceId: string;
  readonly wsConfigured: boolean;
  readonly enabled: boolean;
  readonly status: MosLinkStatus;
  readonly canToggle: boolean;
  readonly isWorkspaceOwner: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStatus = (v: unknown): v is MosLinkStatus =>
  v === "off" || v === "waiting" || v === "live" || v === "lost";

function statusWord(status: MosLinkStatus): string {
  if (status === "live") return BROADCAST_MOS_WORDS.statusLive;
  if (status === "waiting") return BROADCAST_MOS_WORDS.statusWaiting;
  if (status === "lost") return BROADCAST_MOS_WORDS.statusLost;
  return BROADCAST_MOS_WORDS.statusOff;
}

function statusTone(status: MosLinkStatus): string {
  if (status === "live") return "text-meta font-medium text-ok";
  if (status === "lost") return "text-meta font-medium text-attention";
  return "text-meta text-fg-muted";
}

function headersOf(token: string | null, withJson: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (withJson) headers["Content-Type"] = "application/json";
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; body: unknown }> {
  try {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    return { ok: response.ok, body };
  } catch {
    return { ok: false, body: null };
  }
}

async function findWorkspaceForDoc(
  services: PersonServices,
  docId: string,
  hintWorkspaceId: string,
): Promise<string> {
  if (hintWorkspaceId !== "") return hintWorkspaceId;
  const me = await services.api.me().catch(() => null);
  const listed =
    me !== null && me.ok ? me.me.workspaces.map((ws) => ws.id) : [];
  if (listed.length === 1) return listed[0]!;
  for (const wsId of new Set([...listed, services.userId])) {
    const handle = await services
      .openHandle(indexDocId("workspace", wsId))
      .catch(() => null);
    if (handle === null) continue;
    try {
      const index = readWorkspace({
        projects: liveMap(handle, "projects"),
        documents: liveMap(handle, "documents"),
      });
      if (index.documents.has(docId)) return wsId;
    } finally {
      void handle.close();
    }
  }
  return listed[0] ?? services.userId;
}

function parseCapabilities(body: unknown): {
  canToggle: boolean;
  isDocOwner: boolean;
} {
  if (!isRecord(body)) return { canToggle: false, isDocOwner: false };
  const role = body.role;
  const caps = body.capabilities;
  const isDocOwner = role === "owner";
  const hasCaps =
    Array.isArray(caps) &&
    caps.includes("edit_rundowns") &&
    caps.includes("send_to_prompter");
  return { canToggle: isDocOwner || hasCaps, isDocOwner };
}

async function checkWorkspaceOwner(
  workspaceId: string,
  userId: string,
  token: string | null,
  fallback: boolean,
): Promise<boolean> {
  const res = await fetchJson(
    `/api/workspace/people?workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers: headersOf(token, false) },
  );
  if (!res.ok || !isRecord(res.body) || !Array.isArray(res.body.people))
    return fallback;
  const self = res.body.people.find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && entry.userId === userId,
  );
  return self?.role === "owner";
}

export function DetailsBroadcast(props: { readonly docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const environment = useEnvironment();
  const navigate = useNavigate();
  const switchId = useId();
  const [state, setState] = useState<RundownBroadcastState | null>(null);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(() => environment.online());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setOnline(environment.online());
    const onOnline = (): void => setOnline(environment.online());
    const onOffline = (): void => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [environment]);

  useEffect(() => {
    let live = true;
    const load = async (): Promise<void> => {
      if (!online || !environment.online()) return;
      const person = readPerson(environment.tabStorage);
      const token = person?.userId === services.userId ? person.token : null;
      const [rdRes, descRes] = await Promise.all([
        fetchJson(`/api/prompter/${encodeURIComponent(docId)}/mos`, {
          headers: headersOf(token, false),
        }),
        fetchJson("/api/docs/describe", {
          method: "POST",
          headers: headersOf(token, true),
          body: JSON.stringify({ docId }),
        }),
      ]);
      if (!live || !rdRes.ok || !isRecord(rdRes.body)) return;

      const rdWorkspaceId =
        typeof rdRes.body.workspaceId === "string"
          ? rdRes.body.workspaceId
          : "";
      const workspaceId = await findWorkspaceForDoc(
        services,
        docId,
        rdWorkspaceId,
      );
      if (!live) return;

      const enabled = rdRes.body.enabled === true;
      let wsConfigured = rdRes.body.configured === true;
      let status: MosLinkStatus = isStatus(rdRes.body.status)
        ? rdRes.body.status
        : "off";

      if (!wsConfigured) {
        const wsRes = await fetchJson(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/mos`,
          { headers: headersOf(token, false) },
        );
        if (!live) return;
        if (wsRes.ok && isRecord(wsRes.body)) {
          const cfg = wsRes.body.config;
          wsConfigured = isRecord(cfg) && cfg.enabled === true;
          if (wsConfigured && enabled && isStatus(wsRes.body.status))
            status = wsRes.body.status;
        }
      }

      const { canToggle, isDocOwner } = parseCapabilities(descRes.body);
      const isWorkspaceOwner = wsConfigured
        ? isDocOwner
        : await checkWorkspaceOwner(
            workspaceId,
            services.userId,
            token,
            isDocOwner,
          );
      if (!live) return;

      setState({
        workspaceId,
        wsConfigured,
        enabled,
        status: enabled && wsConfigured ? status : "off",
        canToggle,
        isWorkspaceOwner,
      });
    };
    void load();
    return () => {
      live = false;
    };
  }, [docId, environment, services, online]);

  if (state === null) return null;

  if (!state.wsConfigured) {
    if (!state.isWorkspaceOwner) return null;
    const href = `/w/${encodeURIComponent(state.workspaceId)}/settings/broadcast`;
    return (
      <div className="border-t border-line pt-3">
        <a
          href={href}
          className="text-meta text-fg-muted underline-offset-2 hover:text-fg hover:underline"
          onClick={(event) => {
            event.preventDefault();
            void navigate({ href });
          }}
        >
          {BROADCAST_MOS_WORDS.notSetUp}
        </a>
      </div>
    );
  }

  const handleToggle = async (nextEnabled: boolean): Promise<void> => {
    if (!state.canToggle || !online || saving) return;
    setSaving(true);
    setRefusal(null);
    const person = readPerson(environment.tabStorage);
    const token = person?.userId === services.userId ? person.token : null;
    const res = await fetchJson(
      `/api/prompter/${encodeURIComponent(docId)}/mos`,
      {
        method: "PUT",
        headers: headersOf(token, true),
        body: JSON.stringify({
          workspaceId: state.workspaceId,
          enabled: nextEnabled,
        }),
      },
    );
    if (!mountedRef.current) return;
    setSaving(false);
    if (!res.ok || !isRecord(res.body)) {
      setRefusal(BROADCAST_MOS_WORDS.unreachable);
      return;
    }
    const enabled = res.body.enabled === true;
    const status: MosLinkStatus = isStatus(res.body.status)
      ? res.body.status
      : "off";
    setState((prev) => (prev === null ? null : { ...prev, enabled, status }));
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ui font-medium text-fg">
          {BROADCAST_MOS_WORDS.rundownHeading}
        </span>
        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 ${statusTone(state.status)}`}
        >
          <span
            aria-hidden="true"
            className="mn-status-dot"
            data-tone={
              state.status === "live"
                ? "ok"
                : state.status === "lost"
                  ? "attention"
                  : "muted"
            }
          />
          <span>{statusWord(state.status)}</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={switchId} className="text-ui text-fg">
          {BROADCAST_MOS_WORDS.rundownToggle}
        </Label>
        <Switch
          id={switchId}
          data-tour="rundown:mos_toggle"
          checked={state.enabled}
          disabled={!state.canToggle || !online || saving}
          onCheckedChange={(checked) => void handleToggle(checked)}
        />
      </div>
      <p className="text-meta text-fg-muted">
        {BROADCAST_MOS_WORDS.airWindowNote}
      </p>
      {refusal !== null ? (
        <p role="alert" className="text-meta text-fg">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
