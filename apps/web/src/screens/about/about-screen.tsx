// Studio-grade About Manent screen: opened in a compact, theme-matched desktop window from Manent → About Manent.
import { ENGINE_VERSION } from "@manent/pagination";
import type { UpdateState } from "@manent/sync-protocol";
import {
  BRAND_WORDS,
  BusyButton,
  Button,
  DESKTOP_WORDS,
  ManentMark,
  PREFERENCES_WORDS,
  TimingProvider,
  useSubscribable,
} from "@manent/ui";
import { ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";

declare const MANENT_VERSION: string | undefined;

const UNVERSIONED = "0.0.0";
const COPIED_RESET_MS = 1_500;

const UPDATE_LINES: Readonly<Record<UpdateState, string | null>> =
  Object.freeze({
    checking: null,
    up_to_date: PREFERENCES_WORDS.upToDate,
    ready: PREFERENCES_WORDS.updateReady,
    check_failed: PREFERENCES_WORDS.updateCheckFailed,
  });

function systemName(platform: "mac" | "windows" | "linux"): string {
  if (platform === "mac") return DESKTOP_WORDS.systemMac;
  if (platform === "windows") return DESKTOP_WORDS.systemWindows;
  return DESKTOP_WORDS.systemLinux;
}

function InfoRow(props: {
  readonly label: string;
  readonly value: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 px-3 py-1 text-meta">
      <span className="text-fg-muted">{props.label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium text-fg">{props.value}</span>
        {props.action}
      </div>
    </div>
  );
}

export function AboutScreen(): ReactNode {
  const { desktop, now, schedule, updateState, where } = useEnvironment();
  const timing = useMemo(() => ({ now, schedule }), [now, schedule]);
  const update = useSubscribable(updateState);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  const cancelCopy = useRef<(() => void) | null>(null);

  useEffect(() => {
    mounted.current = true;
    document.title = DESKTOP_WORDS.aboutTitle;
    return () => {
      mounted.current = false;
      cancelCopy.current?.();
      cancelCopy.current = null;
    };
  }, []);

  useEffect(() => {
    if (desktop === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      desktop.send({
        v: 1,
        t: "window_action",
        action: "close",
        windowKey: "about",
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [desktop]);

  const version =
    desktop?.version ??
    (typeof MANENT_VERSION === "undefined" ? UNVERSIONED : MANENT_VERSION);
  const channel =
    desktop === null
      ? null
      : desktop.channel === "stable"
        ? PREFERENCES_WORDS.channelStable
        : PREFERENCES_WORDS.channelCanary;
  const platform = desktop?.platform ?? where.platform;
  const system = systemName(platform);
  const infoText = DESKTOP_WORDS.aboutVersionInfo(
    version,
    channel ?? PREFERENCES_WORDS.channelStable,
    ENGINE_VERSION,
    system,
  );

  const copyInfo = useCallback(() => {
    const clipboard = navigator.clipboard;
    if (typeof clipboard?.writeText !== "function") return;
    void clipboard.writeText(infoText).then(
      () => {
        if (!mounted.current) return;
        setCopied(true);
        cancelCopy.current?.();
        cancelCopy.current = schedule(() => {
          if (mounted.current) setCopied(false);
        }, COPIED_RESET_MS);
      },
      () => {
        // clipboard unavailable
      },
    );
  }, [infoText, schedule]);

  const checkForUpdates = useCallback(() => {
    if (desktop === null) return;
    updateState.set("checking");
    desktop.send({ v: 1, t: "check_for_updates" });
  }, [desktop, updateState]);

  const restartToUpdate = useCallback(() => {
    desktop?.send({ v: 1, t: "restart_to_update" });
  }, [desktop]);

  const updateLine = update === null ? null : UPDATE_LINES[update];

  return (
    <TimingProvider timing={timing}>
      <div className="flex flex-1 flex-col items-center justify-between gap-3 px-4 pt-2 pb-4 select-none">
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex size-16 items-center justify-center rounded-surface border border-line bg-raised shadow-raised">
              <ManentMark className="size-10" decorative />
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <h1 className="text-title font-semibold tracking-tight text-fg">
                {BRAND_WORDS.name}
              </h1>
              {channel === null ? null : (
                <span className="mn-tag">{channel}</span>
              )}
            </div>
            <p className="text-meta text-fg-muted">{BRAND_WORDS.tagline}</p>
          </div>

          <SettingsCard divided className="w-full">
            <InfoRow
              label={DESKTOP_WORDS.versionRow}
              value={version}
              action={
                <Button variant="ghost" size="xs" onClick={copyInfo}>
                  {copied
                    ? DESKTOP_WORDS.copiedPath
                    : DESKTOP_WORDS.copyVersionInfo}
                </Button>
              }
            />
            <InfoRow
              label={DESKTOP_WORDS.layoutEngineRow}
              value={String(ENGINE_VERSION)}
            />
            <InfoRow label={DESKTOP_WORDS.systemRow} value={system} />
            <InfoRow
              label={DESKTOP_WORDS.fileTypesRow}
              value={DESKTOP_WORDS.fileTypesValue}
            />
          </SettingsCard>

          {desktop === null ? null : (
            <div className="flex w-full flex-col items-center gap-1.5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <BusyButton
                  variant="outline"
                  size="sm"
                  label={PREFERENCES_WORDS.checkForUpdates}
                  busyLabel={
                    update === "checking"
                      ? PREFERENCES_WORDS.checkingForUpdates
                      : null
                  }
                  onClick={checkForUpdates}
                />
                {update === "ready" ? (
                  <Button variant="default" size="sm" onClick={restartToUpdate}>
                    {DESKTOP_WORDS.restartToUpdate}
                  </Button>
                ) : null}
              </div>
              <p className="text-center text-micro text-fg-muted">
                {updateLine ?? DESKTOP_WORDS.updatesSchedule}
              </p>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col items-center gap-1.5 text-center">
          <div className="flex items-start gap-2 rounded-surface border border-line bg-subtle px-2.5 py-2 text-start">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-icon shrink-0 text-fg-accent"
            />
            <p className="text-micro text-fg-muted">
              {PREFERENCES_WORDS.aiPledge}
            </p>
          </div>
          <p className="text-micro text-fg-muted">
            {PREFERENCES_WORDS.noUsageData}
          </p>
        </div>
      </div>
    </TimingProvider>
  );
}
