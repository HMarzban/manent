// Concept A's smart Mission Pill and screen-adapted 1-click contextual quick actions.
import type { TourScenario } from "@manent/demo";
import { Button, DEMO_WORDS, TOUR_WORDS } from "@manent/ui";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  Columns2Icon,
  CompassIcon,
  ExternalLinkIcon,
  FilePlus2Icon,
  Gamepad2Icon,
  RadioIcon,
  UsersIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { TourActive, TourVerifiedNotice } from "../state/tour.store.ts";
import type { DemoScreenMode } from "./demo-context.ts";

export function DemoMissionPill(props: {
  readonly blockedWindowUrl: string | null;
  readonly verifiedNotice: TourVerifiedNotice | null;
  readonly offline: boolean;
  readonly active: TourActive | null;
  readonly activeScenario: TourScenario | null;
  readonly suggestedScenario: TourScenario;
  readonly isLibrary: boolean;
  readonly onDismissBlocked: () => void;
  readonly onReconnect: () => void;
  readonly onOpenToursTab: () => void;
  readonly onStartSuggested: () => void;
  readonly onNextVerified: (scenarioId: string) => void;
  readonly onOpenActiveTour: () => void;
  readonly onAdvanceActiveStep: () => void;
}): ReactNode {
  const {
    blockedWindowUrl,
    verifiedNotice,
    offline,
    active,
    activeScenario,
    suggestedScenario,
    isLibrary,
    onDismissBlocked,
    onReconnect,
    onOpenToursTab,
    onStartSuggested,
    onNextVerified,
    onOpenActiveTour,
    onAdvanceActiveStep,
  } = props;

  // Priority 1: Clickable pop-up recovery link when browser blocked window.open
  if (blockedWindowUrl !== null) {
    return (
      <div
        className="mn-demo-mission-pill min-w-0"
        data-tone="attention"
        role="status"
      >
        <a
          href={blockedWindowUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDismissBlocked}
          className="inline-flex min-w-0 items-center gap-1.5 truncate px-2 text-meta font-medium text-attention underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{DEMO_WORDS.openInNewTab}</span>
        </a>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={TOUR_WORDS.closeFloating}
          onClick={onDismissBlocked}
          className="h-6 w-6 rounded-full text-attention"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </Button>
      </div>
    );
  }

  // Priority 2: Accountable live verification confirmation with 1-click Next CTA
  if (verifiedNotice !== null) {
    return (
      <div
        className="mn-demo-mission-pill min-w-0"
        data-verified="true"
        role="status"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 px-2 text-meta font-medium text-ok">
          <CheckCircle2Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{verifiedNotice.text}</span>
        </span>
        {verifiedNotice.nextScenarioId !== null ? (
          <button
            type="button"
            onClick={() => onNextVerified(verifiedNotice.nextScenarioId!)}
            className="mn-demo-mission-cta focus-visible:outline-2 focus-visible:outline-focus"
            data-tone="ok"
          >
            <span>{DEMO_WORDS.missionNext}</span>
            <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
          </button>
        ) : null}
      </div>
    );
  }

  // Priority 3: Offline state recovery
  if (offline) {
    return (
      <div className="mn-demo-mission-pill min-w-0" data-tone="attention">
        <button
          type="button"
          aria-label={DEMO_WORDS.tryProof}
          onClick={onOpenToursTab}
          className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate px-2 text-meta font-medium text-attention focus-visible:outline-2 focus-visible:outline-focus"
        >
          <WifiOffIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{DEMO_WORDS.offlineBanner}</span>
        </button>
        <button
          type="button"
          onClick={onReconnect}
          className="mn-demo-mission-cta focus-visible:outline-2 focus-visible:outline-focus"
          data-tone="attention"
        >
          {DEMO_WORDS.reconnect}
        </button>
      </div>
    );
  }

  // Priority 4: Active guided Tour scenario synced directly on the bar
  if (activeScenario !== null && active !== null) {
    const total = activeScenario.steps.length;
    const hasNextStep = active.step < total - 1;
    return (
      <div className="mn-demo-mission-pill min-w-0" data-tone="active">
        <button
          type="button"
          aria-label={DEMO_WORDS.tryProof}
          title={activeScenario.promise}
          onClick={onOpenActiveTour}
          className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate px-2 text-meta font-medium text-fg focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span aria-hidden="true" className="mn-demo-dot" data-tone="accent" />
          <span className="truncate">{activeScenario.promise}</span>
          <span className="shrink-0 text-micro text-fg-muted tabular-nums">
            {active.step + 1}/{total}
          </span>
        </button>
        {hasNextStep ? (
          <button
            type="button"
            onClick={onAdvanceActiveStep}
            className="mn-demo-mission-cta focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span>{DEMO_WORDS.missionNext}</span>
            <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
          </button>
        ) : null}
      </div>
    );
  }

  // Priority 5: Screen-aware suggested Tour mission with 1-click Start/Try CTA
  return (
    <div className="mn-demo-mission-pill mn-demo-mission-wrap min-w-0">
      <button
        type="button"
        aria-label={DEMO_WORDS.tryProof}
        title={suggestedScenario.promise}
        onClick={onOpenToursTab}
        className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate px-2 text-meta font-medium text-fg hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
      >
        <CompassIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-fg-accent"
        />
        <span className="truncate">{suggestedScenario.promise}</span>
      </button>
      <button
        type="button"
        onClick={onStartSuggested}
        className="mn-demo-mission-cta focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span>
          {isLibrary ? DEMO_WORDS.missionStart : DEMO_WORDS.missionTry}
        </span>
        <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
      </button>
    </div>
  );
}

function QuickActionChip(props: {
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly active?: boolean;
  readonly secondary?: boolean;
  readonly onClick: () => void;
}): ReactNode {
  const { label, icon: Icon, active, secondary, onClick } = props;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-tone={active ? "active" : "raised"}
      onClick={onClick}
      className={
        secondary
          ? "mn-demo-pill mn-demo-quick mn-demo-quick-secondary cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-focus"
          : "mn-demo-pill mn-demo-quick cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-focus"
      }
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-fg-accent" />
      <span className="mn-demo-quick-label">{label}</span>
    </button>
  );
}

/** Screen-adapted 1-click contextual quick actions (zero dead buttons on Library). */
export function ContextualQuickActions(props: {
  readonly screenMode: DemoScreenMode;
  readonly offline: boolean;
  readonly writersCount: number;
  readonly hasConnection: boolean;
  readonly onToggleOffline: () => void;
  readonly onToggleWriters: () => void;
  readonly onOpenSecondWindow: () => void;
  readonly onLaunch: (scenarioId: string) => void;
}): ReactNode {
  const {
    screenMode,
    offline,
    writersCount,
    hasConnection,
    onToggleOffline,
    onToggleWriters,
    onOpenSecondWindow,
    onLaunch,
  } = props;

  if (screenMode === "screenplay") {
    return (
      <div className="mn-demo-quick-group flex shrink-0 items-center gap-1">
        {hasConnection ? (
          <QuickActionChip
            label={DEMO_WORDS.offline}
            icon={WifiOffIcon}
            active={offline}
            onClick={onToggleOffline}
          />
        ) : null}
        <QuickActionChip
          label={DEMO_WORDS.quickFiveWriters}
          icon={UsersIcon}
          active={writersCount > 0}
          onClick={onToggleWriters}
        />
        <QuickActionChip
          label={DEMO_WORDS.quickSecondWindow}
          icon={Columns2Icon}
          secondary
          onClick={onOpenSecondWindow}
        />
      </div>
    );
  }
  if (screenMode === "locked") {
    return (
      <div className="mn-demo-quick-group flex shrink-0 items-center gap-1">
        <QuickActionChip
          label={DEMO_WORDS.quickIssuePages}
          icon={FilePlus2Icon}
          onClick={() => onLaunch("production-issue-blue")}
        />
        <QuickActionChip
          label={DEMO_WORDS.quickSecondWindow}
          icon={Columns2Icon}
          secondary
          onClick={onOpenSecondWindow}
        />
      </div>
    );
  }
  if (screenMode === "board") {
    return (
      <div className="mn-demo-quick-group flex shrink-0 items-center gap-1">
        <QuickActionChip
          label={DEMO_WORDS.quickSecondWindow}
          icon={Columns2Icon}
          secondary
          onClick={onOpenSecondWindow}
        />
      </div>
    );
  }
  if (screenMode === "rundown") {
    return (
      <div className="mn-demo-quick-group flex shrink-0 items-center gap-1">
        <QuickActionChip
          label={DEMO_WORDS.quickPrompter}
          icon={RadioIcon}
          onClick={() => onLaunch("rundown-remote-prompter")}
        />
        <QuickActionChip
          label={DEMO_WORDS.quickDropFeed}
          icon={WifiOffIcon}
          onClick={() => onLaunch("rundown-feed-lost")}
        />
      </div>
    );
  }
  if (screenMode === "ink") {
    return (
      <div className="mn-demo-quick-group flex shrink-0 items-center gap-1">
        <QuickActionChip
          label={DEMO_WORDS.quickPlayInk}
          icon={Gamepad2Icon}
          onClick={() => onLaunch("write-ink-play")}
        />
        {hasConnection ? (
          <QuickActionChip
            label={DEMO_WORDS.offline}
            icon={WifiOffIcon}
            active={offline}
            onClick={onToggleOffline}
          />
        ) : null}
      </div>
    );
  }
  return null;
}
