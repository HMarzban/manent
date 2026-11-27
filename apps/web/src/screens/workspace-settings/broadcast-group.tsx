// Workspace settings Broadcast group: external MOS 2.8.5 / Autoscript WinPlus-IP prompter setup (ADR 0073).
import {
  BROADCAST_MOS_WORDS as W,
  Button,
  Segmented,
  Skeleton,
} from "@manent/ui";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { readPerson } from "../../session.ts";
import { SettingsNotice } from "../../settings-shell/settings-card.tsx";
import {
  ADVANCED_FIELDS,
  BroadcastAlert,
  BroadcastField,
  MemberBroadcastReadout,
  RemoveConfirmRow,
  STATUS_WORD,
  SYSTEM_OPTIONS,
  bodyFromDraft,
  draftFromConfig,
  isDialect,
  isRecord,
  parseWorkspacePayload,
  refusalFor,
  requestMosJson,
  statusTone,
} from "./broadcast-parts.tsx";
import type { BusyMode, DraftState, MosPayload } from "./broadcast-parts.tsx";
import type { WorkspaceSettingsGroupProps } from "./groups.ts";

type AsyncSurface =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: MosPayload }
  | { readonly kind: "unavailable"; readonly cached: MosPayload | null };

interface UiState {
  readonly advancedOpen: boolean;
  readonly confirmRemove: boolean;
  readonly busy: BusyMode;
  readonly checkLive: boolean;
  readonly refusal: string | null;
}

const INITIAL_UI: UiState = Object.freeze({
  advancedOpen: false,
  confirmRemove: false,
  busy: "idle",
  checkLive: false,
  refusal: null,
});

const sessionCache = new Map<string, MosPayload>();

export function BroadcastGroup(props: WorkspaceSettingsGroupProps): ReactNode {
  const { workspaceId, canChange, online } = props;
  const services = useServices();
  const environment = useEnvironment();
  const uid = useId();
  const cacheKey = `${services.userId}:${workspaceId}`;
  const baseUrl = `/api/workspaces/${encodeURIComponent(workspaceId)}/mos`;
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const tokenOf = useCallback((): string | null => {
    const person = readPerson(environment.tabStorage);
    return person?.userId === services.userId ? person.token : null;
  }, [environment.tabStorage, services.userId]);

  const [surface, setSurface] = useState<AsyncSurface>(() => {
    const cached = sessionCache.get(cacheKey) ?? null;
    if (cached !== null) return { kind: "ready", data: cached };
    return online ? { kind: "loading" } : { kind: "unavailable", cached: null };
  });
  const [draft, setDraft] = useState<DraftState>(() =>
    draftFromConfig(sessionCache.get(cacheKey)?.config ?? null),
  );
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const patchUi = (patch: Partial<UiState>): void =>
    setUi((prev) => ({ ...prev, ...patch }));

  const applyPayload = useCallback(
    (next: MosPayload): void => {
      sessionCache.set(cacheKey, next);
      setSurface({ kind: "ready", data: next });
      setDraft(draftFromConfig(next.config));
    },
    [cacheKey],
  );

  const reload = useCallback(async (): Promise<void> => {
    const cached = sessionCache.get(cacheKey) ?? null;
    if (!online) {
      setSurface(
        cached !== null
          ? { kind: "ready", data: cached }
          : { kind: "unavailable", cached: null },
      );
      return;
    }
    if (cached === null) setSurface({ kind: "loading" });
    const res = await requestMosJson(baseUrl, "GET", tokenOf());
    const parsed = res.ok ? parseWorkspacePayload(res.body) : null;
    if (parsed === null) setSurface({ kind: "unavailable", cached });
    else applyPayload(parsed);
  }, [applyPayload, baseUrl, cacheKey, online, tokenOf]);

  useEffect(() => {
    setUi(INITIAL_UI);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (ui.confirmRemove) cancelRef.current?.focus();
  }, [ui.confirmRemove]);

  const busy = ui.busy !== "idle";
  const host = draft.host.trim();
  const payload =
    surface.kind === "ready"
      ? surface.data
      : surface.kind === "unavailable"
        ? surface.cached
        : null;

  const updateDraft = (patch: Partial<DraftState>): void => {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (ui.checkLive || ui.refusal !== null)
      patchUi({ checkLive: false, refusal: null });
  };

  const runAction = (mode: BusyMode, work: () => Promise<void>): void => {
    if (!canChange || !online || busy) return;
    patchUi({ busy: mode, checkLive: false, refusal: null });
    void work().finally(() => patchUi({ busy: "idle" }));
  };

  const handleSave = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (host.length === 0) return;
    runAction("save", async () => {
      const res = await requestMosJson(
        baseUrl,
        "PUT",
        tokenOf(),
        bodyFromDraft(draft),
      );
      const parsed = res.ok ? parseWorkspacePayload(res.body) : null;
      if (parsed === null)
        return patchUi({ refusal: refusalFor(res.body, "error", host) });
      applyPayload(parsed);
      patchUi({ confirmRemove: false });
    });
  };

  const handleCheck = (): void => {
    if (host.length === 0) return;
    runAction("check", async () => {
      const res = await requestMosJson(
        `${baseUrl}/check`,
        "POST",
        tokenOf(),
        bodyFromDraft(draft),
      );
      if (res.ok && isRecord(res.body) && res.body.ok === true)
        return patchUi({ checkLive: true });
      patchUi({ refusal: refusalFor(res.body, "reason", host) });
    });
  };

  const handleRemove = (): void =>
    runAction("remove", async () => {
      const res = await requestMosJson(baseUrl, "DELETE", tokenOf());
      if (!res.ok) return patchUi({ refusal: W.unreachable });
      applyPayload({ config: null, status: "off" });
      patchUi({ confirmRemove: false });
    });

  return (
    <section
      data-tour="workspace:broadcast"
      aria-labelledby={`${uid}-h`}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${uid}-h`} className="text-title">
            {W.title}
          </h2>
          {payload === null ? null : (
            <span className={statusTone(payload.status)}>
              {STATUS_WORD[payload.status]}
            </span>
          )}
        </div>
        <p className="text-ui text-fg-muted">{W.description}</p>
      </div>

      {online ? null : (
        <SettingsNotice tone="offline">{W.needsConnection}</SettingsNotice>
      )}

      {surface.kind === "loading" ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton aria-hidden="true" className="h-control w-48" />
          <Skeleton aria-hidden="true" className="h-control w-full" />
        </div>
      ) : null}

      {surface.kind === "unavailable" && online ? (
        <BroadcastAlert
          message={
            surface.cached === null ? W.couldNotLoad : W.couldNotLoadCached
          }
          onRetry={() => void reload()}
        />
      ) : null}

      {payload === null ? null : !canChange ? (
        <MemberBroadcastReadout payload={payload} />
      ) : (
        <form
          onSubmit={handleSave}
          className="flex flex-col gap-4 rounded-surface border border-line bg-raised p-4"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-fg">
              {W.systemLabel}
            </span>
            <Segmented
              label={W.systemLabel}
              value={draft.dialect}
              options={SYSTEM_OPTIONS}
              disabled={!online || busy}
              onChange={(next) => {
                if (isDialect(next)) updateDraft({ dialect: next });
              }}
            />
          </div>

          <BroadcastField
            id={`${uid}-host`}
            label={W.addressLabel}
            value={draft.host}
            disabled={!online || busy}
            hint={W.addressHint}
            onChange={(next) => updateDraft({ host: next })}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              data-tour="mos:save"
              disabled={!online || busy || host.length === 0}
              className="cursor-pointer"
            >
              {ui.busy === "save" ? W.saving : W.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!online || busy || host.length === 0}
              className="cursor-pointer"
              onClick={handleCheck}
            >
              {ui.busy === "check" ? W.checking : W.check}
            </Button>
            {payload.config !== null && !ui.confirmRemove ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!online || busy}
                className="ms-auto cursor-pointer"
                onClick={() => patchUi({ confirmRemove: true })}
              >
                {W.remove}
              </Button>
            ) : null}
          </div>

          {ui.confirmRemove && payload.config !== null ? (
            <RemoveConfirmRow
              cancelRef={cancelRef}
              online={online}
              removing={ui.busy === "remove"}
              onCancel={() => patchUi({ confirmRemove: false })}
              onConfirm={handleRemove}
            />
          ) : null}

          <div className="border-t border-line pt-3">
            <button
              type="button"
              aria-expanded={ui.advancedOpen}
              aria-controls={`${uid}-adv`}
              className="flex cursor-pointer items-center gap-1.5 text-ui font-medium text-fg-muted hover:text-fg"
              onClick={() => patchUi({ advancedOpen: !ui.advancedOpen })}
            >
              {ui.advancedOpen ? (
                <ChevronDownIcon aria-hidden="true" className="size-icon" />
              ) : (
                <ChevronRightIcon aria-hidden="true" className="size-icon" />
              )}
              {W.advancedToggle}
            </button>
            {ui.advancedOpen ? (
              <div
                id={`${uid}-adv`}
                className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {ADVANCED_FIELDS.map(([fieldKey, label, numeric, wide]) => (
                  <BroadcastField
                    key={fieldKey}
                    id={`${uid}-${fieldKey}`}
                    label={label}
                    value={draft[fieldKey]}
                    disabled={!online || busy}
                    numeric={numeric}
                    hint={wide ? W.allowedNetworksHint : undefined}
                    span={wide}
                    onChange={(next) => updateDraft({ [fieldKey]: next })}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {ui.checkLive ? (
            <p role="status" className="text-ui font-medium text-ok">
              {W.statusLive}
            </p>
          ) : null}
          {ui.refusal === null ? null : <BroadcastAlert message={ui.refusal} />}
        </form>
      )}
    </section>
  );
}
