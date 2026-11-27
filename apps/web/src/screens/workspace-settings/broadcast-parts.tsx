// Sub-components, DTO parsing, and HTTP helpers for Workspace settings → Broadcast (MOS, ADR 0073).
import type { MosDialect } from "@manent/formats";
import { BROADCAST_MOS_WORDS as W, Button, Input, Label } from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import type { RefObject, ReactNode } from "react";

export type MosStatus = "off" | "waiting" | "live" | "lost";
export type BusyMode = "idle" | "save" | "check" | "remove";

export interface MosConfig {
  readonly dialect: MosDialect;
  readonly host: string;
  readonly lowerPort: number;
  readonly upperPort: number;
  readonly ncsId: string;
  readonly mosId: string;
  readonly allowedCidrs: readonly string[];
  readonly enabled: boolean;
}

export interface MosPayload {
  readonly config: MosConfig | null;
  readonly status: MosStatus;
}

export interface DraftState {
  readonly dialect: MosDialect;
  readonly host: string;
  readonly lowerPort: string;
  readonly upperPort: string;
  readonly ncsId: string;
  readonly mosId: string;
  readonly allowedCidrs: string;
}

export const SYSTEM_OPTIONS = Object.freeze([
  { value: "autoscript_winplus_ip", label: W.autoscript },
  { value: "mos_2_8_5", label: W.mosStandard },
]);

export const STATUS_WORD: Readonly<Record<MosStatus, string>> = Object.freeze({
  live: W.statusLive,
  waiting: W.statusWaiting,
  lost: W.statusLost,
  off: W.statusOff,
});

export const ADVANCED_FIELDS = [
  ["lowerPort", W.lowerPortLabel, true, false],
  ["upperPort", W.upperPortLabel, true, false],
  ["ncsId", W.ncsIdLabel, false, false],
  ["mosId", W.mosIdLabel, false, false],
  ["allowedCidrs", W.allowedNetworksLabel, false, true],
] as const;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isDialect = (v: unknown): v is MosDialect =>
  v === "autoscript_winplus_ip" || v === "mos_2_8_5";

const isStatus = (v: unknown): v is MosStatus =>
  v === "off" || v === "waiting" || v === "live" || v === "lost";

export function statusTone(status: MosStatus): string {
  if (status === "live") return "text-meta font-medium text-ok";
  if (status === "lost") return "text-meta font-medium text-attention";
  return "text-meta text-fg-muted";
}

export function parseWorkspacePayload(raw: unknown): MosPayload | null {
  if (!isRecord(raw) || !isStatus(raw.status)) return null;
  if (raw.config === null) return { config: null, status: raw.status };
  const c = raw.config;
  if (!isRecord(c) || !isDialect(c.dialect)) return null;
  const { host, lowerPort, upperPort, ncsId, mosId, allowedCidrs, enabled } = c;
  if (
    typeof host !== "string" ||
    typeof lowerPort !== "number" ||
    typeof upperPort !== "number" ||
    typeof ncsId !== "string" ||
    typeof mosId !== "string" ||
    typeof enabled !== "boolean" ||
    !Array.isArray(allowedCidrs) ||
    !allowedCidrs.every((x): x is string => typeof x === "string")
  )
    return null;
  return {
    status: raw.status,
    config: {
      dialect: c.dialect,
      host,
      lowerPort,
      upperPort,
      ncsId,
      mosId,
      allowedCidrs,
      enabled,
    },
  };
}

export function draftFromConfig(config: MosConfig | null): DraftState {
  return {
    dialect: config?.dialect ?? "autoscript_winplus_ip",
    host: config?.host ?? "",
    lowerPort: String(config?.lowerPort ?? 10540),
    upperPort: String(config?.upperPort ?? 10541),
    ncsId: config?.ncsId ?? "manent.ncs",
    mosId: config?.mosId ?? "prompter.studio",
    allowedCidrs: config?.allowedCidrs.join(", ") ?? "",
  };
}

export function bodyFromDraft(draft: DraftState): Record<string, unknown> {
  const lp = Number.parseInt(draft.lowerPort.trim(), 10);
  const up = Number.parseInt(draft.upperPort.trim(), 10);
  return {
    dialect: draft.dialect,
    host: draft.host.trim(),
    lowerPort: Number.isFinite(lp) ? lp : 10540,
    upperPort: Number.isFinite(up) ? up : 10541,
    ncsId: draft.ncsId.trim() || "manent.ncs",
    mosId: draft.mosId.trim() || "prompter.studio",
    allowedCidrs: draft.allowedCidrs
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    enabled: true,
  };
}

export async function requestMosJson(
  url: string,
  method: string,
  token: string | null,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; body: unknown }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, body: await res.json().catch(() => null) };
  } catch {
    return { ok: false, body: null };
  }
}

export function refusalFor(
  body: unknown,
  key: "error" | "reason",
  host: string,
): string {
  return isRecord(body) && body[key] === "host_not_allowed"
    ? W.outsideStudioNetwork(host)
    : W.unreachable;
}

export function BroadcastField(props: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  numeric?: boolean;
  hint?: string;
  span?: boolean;
  onChange(value: string): void;
}): ReactNode {
  return (
    <div
      className={
        props.span ? "flex flex-col gap-1 sm:col-span-2" : "flex flex-col gap-1"
      }
    >
      <Label htmlFor={props.id} className="text-meta font-medium text-fg">
        {props.label}
      </Label>
      <Input
        id={props.id}
        inputMode={props.numeric ? "numeric" : undefined}
        value={props.value}
        disabled={props.disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className={
          props.numeric
            ? "border-line-strong bg-well tabular-nums text-ui text-fg"
            : "border-line-strong bg-well text-ui text-fg"
        }
      />
      {props.hint === undefined ? null : (
        <p className="text-meta text-fg-muted">{props.hint}</p>
      )}
    </div>
  );
}

export function BroadcastAlert(props: {
  message: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 text-ui text-fg"
    >
      <span className="flex items-center gap-1.5">
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-attention"
        />
        {props.message}
      </span>
      {props.onRetry === undefined ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={props.onRetry}
        >
          {W.tryAgain}
        </Button>
      )}
    </div>
  );
}

export function RemoveConfirmRow(props: {
  cancelRef: RefObject<HTMLButtonElement | null>;
  online: boolean;
  removing: boolean;
  onCancel(): void;
  onConfirm(): void;
}): ReactNode {
  return (
    <div
      className="flex flex-col gap-2 rounded-control border border-line bg-subtle p-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !props.removing) {
          event.preventDefault();
          props.onCancel();
        }
      }}
    >
      <p className="text-ui font-medium text-fg">{W.removeConfirmTitle}</p>
      <div className="flex items-center gap-2">
        <Button
          ref={props.cancelRef}
          type="button"
          variant="outline"
          size="sm"
          disabled={props.removing}
          className="cursor-pointer"
          onClick={props.onCancel}
        >
          {W.cancel}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={!props.online || props.removing}
          className="cursor-pointer"
          onClick={props.onConfirm}
        >
          {W.remove}
        </Button>
      </div>
    </div>
  );
}

export function MemberBroadcastReadout(props: {
  payload: MosPayload;
}): ReactNode {
  if (props.payload.config === null || !props.payload.config.enabled) {
    return <p className="text-ui text-fg-muted">{W.nothingSetUp}</p>;
  }
  return (
    <div className="flex items-center justify-between gap-4 rounded-surface border border-line bg-raised px-4 py-3">
      <span className="text-ui font-medium text-fg">{W.title}</span>
      <div className="flex items-center gap-3">
        <span className="text-meta font-medium text-ok">{W.statusOn}</span>
        <span className={statusTone(props.payload.status)}>
          {STATUS_WORD[props.payload.status]}
        </span>
      </div>
    </div>
  );
}
