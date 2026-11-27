// Concept A's Unified 432 px Stage Sheet: two tabs (Demo controls | Tour story tracks) with zero truncation.
import { TOUR_TRACKS } from "@manent/demo";
import type { TourTrackId } from "@manent/demo";
import {
  Button,
  DEMO_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@manent/ui";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ClapperboardIcon,
  CompassIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Gamepad2Icon,
  LockIcon,
  RadioIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { ConnectionControl } from "./connection-transport.ts";
import { ConnectionChoice } from "./connection.tsx";
import { DemoFormatJumps } from "./demo-format-jumps.tsx";
import { ReorganiseControl } from "./reorganise-control.tsx";
import { ResetControl } from "./reset-control.tsx";
import { ServerStatusControl } from "./server-status-control.tsx";
import type { DemoControl } from "./use-demo.ts";
import { tourTrackCopy } from "./use-tour-progress.ts";
import type { TourProgressSnapshot } from "./use-tour-progress.ts";
import { WritersControl } from "./writers-control.tsx";

export type StageSheetTab = "controls" | "tours";

const TRACK_ICON: Readonly<
  Record<TourTrackId, ComponentType<{ className?: string }>>
> = Object.freeze({
  overview: CompassIcon,
  screenwriter: FileTextIcon,
  showrunner: UsersIcon,
  coordinator: LockIcon,
  broadcast: RadioIcon,
  game: Gamepad2Icon,
  resilience: ShieldCheckIcon,
});

/**
 * Unified 432 px Stage Sheet:
 * - Tab 1 (`controls`): 3 full-width vertical blast-radius bands (01 This window, 02 This script, 03 Every window).
 * - Tab 2 (`tours`): 7 canonical Story Tracks backed directly by the Tour manifest + link to all 85 Tour parts.
 */
export function StageSheet(props: {
  readonly docId: string | null;
  readonly signedIn: boolean;
  readonly unreachable: string | null;
  readonly connection: ConnectionControl | null;
  readonly control: DemoControl | null;
  readonly serverStopped: boolean;
  readonly companionName: string;
  readonly blockedWindowUrl: string | null;
  readonly progress: TourProgressSnapshot;
  readonly activeTrackId: TourTrackId | null;
  readonly open: boolean;
  readonly tab: StageSheetTab;
  readonly sidePanelOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onTabChange: (tab: StageSheetTab) => void;
  readonly onOpenSecondWindow: () => void;
  readonly onDismissBlocked: () => void;
  readonly onOpenScript: () => void;
  readonly onStartTrack: (trackId: TourTrackId) => void;
  readonly onOpenPath?: (href: string) => void;
  readonly onOpenTour: () => void;
  readonly onHideDemoBar: () => void;
}): ReactNode {
  const {
    docId,
    signedIn,
    unreachable,
    connection,
    control,
    serverStopped,
    companionName,
    blockedWindowUrl,
    progress,
    activeTrackId,
    open,
    tab,
    sidePanelOpen,
    onOpenChange,
    onTabChange,
    onOpenSecondWindow,
    onDismissBlocked,
    onOpenScript,
    onStartTrack,
    onOpenPath,
    onOpenTour,
    onHideDemoBar,
  } = props;

  const tourBadge =
    progress.highlightsDone < progress.highlightsTotal
      ? `${progress.highlightsDone}/${progress.highlightsTotal}`
      : `${progress.doneCount}/${progress.totalCount}`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-tone={open ? "active" : undefined}
            aria-label={DEMO_WORDS.proofLab}
            className="mn-demo-pill cursor-pointer font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
          />
        }
      >
        <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
        <span className="hidden md:inline">{DEMO_WORDS.proofLab}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="hidden size-3 md:inline"
        />
      </PopoverTrigger>
      <PopoverContent
        data-surface="demo"
        align="end"
        alignOffset={sidePanelOpen ? 232 : 0}
        className="max-h-[82dvh] w-[min(27rem,calc(100vw-1.5rem))] overflow-y-auto p-3.5 data-closed:hidden"
      >
        <div className="flex flex-col gap-3 text-ui">
          <div className="mn-demo-stage-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "controls"}
              onClick={() => onTabChange("controls")}
              className="mn-demo-stage-tab focus-visible:outline-2 focus-visible:outline-focus"
            >
              <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
              <span>{DEMO_WORDS.stageTabControls}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "tours"}
              onClick={() => onTabChange("tours")}
              className="mn-demo-stage-tab focus-visible:outline-2 focus-visible:outline-focus"
            >
              <ClapperboardIcon aria-hidden="true" className="size-3.5" />
              <span>{DEMO_WORDS.stageTabTours}</span>
              <span className="text-micro text-fg-muted tabular-nums">
                {tourBadge}
              </span>
            </button>
          </div>

          {tab === "controls" ? (
            <div className="mn-demo-scope-stack">
              <p className="text-meta text-fg-muted">
                {DEMO_WORDS.proofLabSubtitle}
              </p>

              <div className="mn-demo-scope-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-micro font-semibold tracking-wide text-fg-muted uppercase">
                    {DEMO_WORDS.scopeWindow}
                  </span>
                  <span className="text-micro text-ok">
                    {DEMO_WORDS.scopeWindowHint}
                  </span>
                </div>
                {connection !== null ? (
                  <ConnectionChoice
                    control={connection}
                    tour={false}
                    fullWidth
                  />
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  onClick={onOpenSecondWindow}
                >
                  <span>{DEMO_WORDS.openSecondWindow(companionName)}</span>
                  <ExternalLinkIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
                </Button>
                {blockedWindowUrl !== null ? (
                  <a
                    href={blockedWindowUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onDismissBlocked}
                    className="inline-flex items-center gap-1.5 text-meta font-medium text-attention underline underline-offset-2"
                  >
                    <ExternalLinkIcon
                      aria-hidden="true"
                      className="size-3 shrink-0"
                    />
                    <span>{DEMO_WORDS.openInNewTab}</span>
                  </a>
                ) : null}
              </div>

              <div className="mn-demo-scope-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-micro font-semibold tracking-wide text-fg-muted uppercase">
                    {DEMO_WORDS.scopeScript}
                  </span>
                  <span className="text-micro text-fg-muted">
                    {DEMO_WORDS.scopeScriptHint}
                  </span>
                </div>
                {docId === null ? (
                  <div className="flex items-center justify-between gap-2 rounded-control border border-line bg-overlay px-2.5 py-2">
                    <p className="text-meta leading-snug text-fg-muted">
                      {DEMO_WORDS.needsScriptLab}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={onOpenScript}
                    >
                      {DEMO_WORDS.openScriptPrompt}
                    </Button>
                  </div>
                ) : (
                  <>
                    <WritersControl
                      docId={docId}
                      signedIn={signedIn}
                      unreachable={unreachable}
                    />
                    <ReorganiseControl
                      docId={docId}
                      signedIn={signedIn}
                      unreachable={unreachable}
                    />
                  </>
                )}
              </div>

              <div
                className="mn-demo-scope-card"
                data-scope={serverStopped ? "danger" : "attention"}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-micro font-semibold tracking-wide text-attention uppercase">
                    {DEMO_WORDS.scopeAll}
                  </span>
                  <span className="text-micro text-attention">
                    {DEMO_WORDS.scopeAllHint}
                  </span>
                </div>
                {control !== null ? (
                  <div className="grid grid-cols-2 items-end gap-2">
                    <ServerStatusControl
                      {...control}
                      resetting={false}
                      inline={false}
                      onAction={() => onOpenChange(false)}
                    />
                    <ResetControl {...control} />
                  </div>
                ) : null}
                <p className="text-micro leading-snug text-fg-muted">
                  {DEMO_WORDS.allWindowsNote}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-fg">
                  {DEMO_WORDS.chooseTourHeading}
                </span>
                <span className="text-micro text-fg-muted tabular-nums">
                  {DEMO_WORDS.highlightsVerified(
                    progress.highlightsDone,
                    progress.highlightsTotal,
                  )}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {TOUR_TRACKS.map((track) => {
                  const Icon = TRACK_ICON[track.id];
                  const copy = tourTrackCopy(track.id);
                  const stats = progress.trackStats(track.id);
                  const highlighted =
                    activeTrackId === track.id ||
                    (activeTrackId === null && track.featured);
                  return (
                    <button
                      key={track.id}
                      type="button"
                      data-active={highlighted ? "true" : undefined}
                      onClick={() => onStartTrack(track.id)}
                      className="mn-demo-proof-card"
                    >
                      <span
                        aria-hidden="true"
                        className="mn-demo-proof-icon"
                        data-tone={track.featured ? "attention" : undefined}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-fg">
                            {copy.title}
                          </span>
                          <span className="shrink-0 text-micro text-fg-muted tabular-nums">
                            {stats.done > 0
                              ? `${stats.done}/${stats.total}`
                              : DEMO_WORDS.trackParts(stats.total)}
                          </span>
                        </span>
                        <span className="block text-meta text-fg-muted">
                          {copy.body}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <DemoFormatJumps signedIn={signedIn} onOpenPath={onOpenPath} />

              <div className="flex flex-col gap-1 border-t border-line pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-fg-muted"
                  onClick={onOpenTour}
                >
                  <span>{DEMO_WORDS.allTourParts(progress.totalCount)}</span>
                  <ArrowRightIcon aria-hidden="true" className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-fg-muted sm:hidden"
                  onClick={onHideDemoBar}
                >
                  {DEMO_WORDS.hideDemoBar}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
