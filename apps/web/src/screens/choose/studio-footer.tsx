// Studio resource strip on Choose who you are: Desktop app releases, live PWA install/offline readiness, This device vault, and GitHub source.
import {
  Button,
  CHOOSE_WORDS,
  DESKTOP_WORDS,
  PREFERENCES_WORDS,
  createValue,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import {
  AppWindowIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  FolderOpenIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  MonitorDownIcon,
} from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { OfflineReadinessState } from "../../boot/offline-warm.ts";
import type { DesktopHost } from "../../desktop/host.ts";
import { installHint, isStandalone } from "../../platform.ts";
import { browserInstallStore } from "../../pwa/install.ts";
import { useEnvironment } from "../../services/context.tsx";

const GITHUB_URL = "https://github.com/HMarzban/manent";
const RELEASES_URL = "https://github.com/HMarzban/manent/releases";
const NO_READINESS: Subscribable<OfflineReadinessState | null> =
  createValue(null);

function GitHubMark(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="size-icon-lg"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.09.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.38 9.38 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.82-4.57 5.07.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.22 10.22 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function PwaInstallCard(): ReactNode {
  const { offlineReadiness } = useEnvironment();
  const readiness = useSubscribable(offlineReadiness ?? NO_READINESS);
  const store = browserInstallStore();
  const canInstall = useSyncExternalStore(
    useCallback((listener: () => void) => store.subscribe(listener), [store]),
    () => store.canInstall(),
  );
  const standalone = isStandalone();
  const hint = installHint();

  if (canInstall) {
    return (
      <a
        href="#install"
        role="button"
        onClick={(event) => {
          event.preventDefault();
          void store.promptInstall();
        }}
        className="mn-card mn-choose-link flex items-center gap-3 px-3.5 py-3 text-start"
      >
        <span
          aria-hidden="true"
          className="mn-choose-link-icon flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-well text-fg-accent"
        >
          <AppWindowIcon className="size-icon-lg" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ui font-medium text-fg">
            {PREFERENCES_WORDS.installManent}
          </span>
          <span className="truncate text-meta text-fg-muted">
            {PREFERENCES_WORDS.installChromium}
          </span>
        </span>
        <ArrowUpRightIcon
          aria-hidden="true"
          className="mn-choose-link-arrow size-icon shrink-0"
        />
      </a>
    );
  }

  const preparing =
    readiness?.status === "installing" || readiness?.status === "warming";
  const ready = readiness?.status === "ready";
  const dataSaver = readiness?.status === "paused_save_data";
  const onlineOnly = readiness?.status === "online_only";
  const ratio =
    readiness?.status === "warming" && readiness.total > 0
      ? 0.2 + 0.8 * Math.min(1, readiness.cached / readiness.total)
      : 0.15;

  const title = standalone
    ? CHOOSE_WORDS.footerPwaInstalled
    : preparing
      ? PREFERENCES_WORDS.offlineNoticePreparing
      : ready && hint === "none"
        ? PREFERENCES_WORDS.offlineNoticeReadyTitle
        : PREFERENCES_WORDS.installManent;
  const body = preparing
    ? readiness.status === "warming" && readiness.total > 0
      ? PREFERENCES_WORDS.offlineNoticeProgress(
          readiness.cached,
          readiness.total,
        )
      : PREFERENCES_WORDS.offlineNoticeInstallingBody
    : standalone || (ready && hint === "none")
      ? PREFERENCES_WORDS.offlineReady
      : dataSaver
        ? PREFERENCES_WORDS.offlineDataSaver
        : onlineOnly
          ? PREFERENCES_WORDS.offlineOnlineOnly
          : hint === "macos_safari"
            ? PREFERENCES_WORDS.installMacSafari
            : hint === "ios_safari"
              ? PREFERENCES_WORDS.installIosSafari
              : CHOOSE_WORDS.footerPwaFallback;

  return (
    <div className="flex items-center gap-3 rounded-surface border border-line bg-raised px-3.5 py-3">
      <span
        aria-hidden="true"
        className={
          ready || standalone
            ? "flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-well text-ok"
            : "flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-well text-fg-accent"
        }
      >
        {preparing ? (
          <LoaderCircleIcon className="size-icon-lg animate-spin" />
        ) : standalone || ready ? (
          <CheckCircle2Icon className="size-icon-lg animate-in zoom-in-95 fade-in-0 duration-(--dur-fast) ease-out" />
        ) : (
          <AppWindowIcon className="size-icon-lg" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-ui font-medium text-fg">{title}</span>
        <span className="text-meta text-fg-muted tabular-nums">{body}</span>
        {preparing ? (
          <span aria-hidden="true" className="mn-progress-track mt-1.5 w-full">
            <span
              className="mn-progress-fill"
              style={{ transform: `scaleX(${ratio})` }}
            />
          </span>
        ) : null}
      </span>
    </div>
  );
}

function DesktopVaultCard(props: { desktop: DesktopHost }): ReactNode {
  return (
    <div className="flex items-center gap-3 rounded-surface border border-line bg-raised px-3.5 py-3 text-start">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-well text-ok"
      >
        <HardDriveIcon className="size-icon-lg" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-ui font-medium text-fg">
          {DESKTOP_WORDS.deviceVaultTitle}
        </span>
        <span className="text-meta text-fg-muted">
          {DESKTOP_WORDS.deviceVaultBody}
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => props.desktop.send({ v: 1, t: "show_folder" })}
        className="shrink-0 gap-1.5"
      >
        <FolderOpenIcon aria-hidden="true" className="size-icon shrink-0" />
        <span>{DESKTOP_WORDS.openDataFolder}</span>
      </Button>
    </div>
  );
}

/** Studio resource links: Desktop app releases, live PWA install/offline readiness, This device vault, and GitHub source repository. */
export function StudioFooter(): ReactNode {
  const { where, desktop } = useEnvironment();
  const onWeb = where.shell === "web";

  return (
    <nav
      aria-label={CHOOSE_WORDS.footerLabel}
      className={
        onWeb
          ? "grid grid-cols-1 gap-3 sm:grid-cols-3 animate-in fade-in-0 duration-(--dur-fast) ease-out"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2 animate-in fade-in-0 duration-(--dur-fast) ease-out"
      }
    >
      {onWeb && (
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mn-card mn-choose-link flex items-center gap-3 px-3.5 py-3 text-start"
        >
          <span
            aria-hidden="true"
            className="mn-choose-link-icon flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-well text-fg-accent"
          >
            <MonitorDownIcon className="size-icon-lg" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-ui font-medium text-fg">
              {CHOOSE_WORDS.footerDesktopTitle}
            </span>
            <span className="text-meta text-fg-muted">
              {CHOOSE_WORDS.footerDesktopBody}
            </span>
          </span>
          <ArrowUpRightIcon
            aria-hidden="true"
            className="mn-choose-link-arrow size-icon shrink-0"
          />
        </a>
      )}

      {onWeb && <PwaInstallCard />}

      {!onWeb && desktop !== null && <DesktopVaultCard desktop={desktop} />}

      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mn-card mn-choose-link flex items-center gap-3 px-3.5 py-3 text-start"
      >
        <span
          aria-hidden="true"
          className="mn-choose-link-icon flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-well text-fg"
        >
          <GitHubMark />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ui font-medium text-fg">
            {CHOOSE_WORDS.footerGithubTitle}
          </span>
          <span className="text-meta text-fg-muted">
            {CHOOSE_WORDS.footerGithubBody}
          </span>
        </span>
        <ArrowUpRightIcon
          aria-hidden="true"
          className="mn-choose-link-arrow size-icon shrink-0"
        />
      </a>
    </nav>
  );
}
