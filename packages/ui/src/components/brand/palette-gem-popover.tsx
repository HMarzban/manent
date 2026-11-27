// Museum Edition Collector Vitrine popover: 24-gem browser, live theme preview, discovery tally, foley toggle & stage.
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { StudioPaletteId } from "@manent/settings";
import { cn } from "cn";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PaletteIcon,
  RotateCcwIcon,
  SparklesIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  APPEARANCE_STUDIO_WORDS,
  STUDIO_PALETTES,
} from "../../words/appearance.ts";
import { Button } from "../stock/button.tsx";
import { playGemFoley } from "./gem-audio.ts";
import { GemStage } from "./gem-stage.tsx";
import { HiddenGemIcon } from "./hidden-gems.tsx";

function paletteMetadata(palette: StudioPaletteId): {
  readonly entry: (typeof STUDIO_PALETTES)[number];
  readonly index: number;
  readonly edition: number;
} {
  const index = STUDIO_PALETTES.findIndex((item) => item.id === palette);
  if (index === -1) {
    return { entry: STUDIO_PALETTES[0]!, index: 0, edition: 1 };
  }
  return { entry: STUDIO_PALETTES[index]!, index, edition: index + 1 };
}

/** Shared controlled Collector Vitrine popover with in-vitrine 24-gem browser and live theme preview. */
export function PaletteGemPopover(props: {
  readonly palette: StudioPaletteId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly anchorRef?: RefObject<HTMLElement | null>;
  readonly trigger?: ReactNode;
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly align?: "start" | "center" | "end";
  readonly onOpenAppearance?: () => void;
  readonly onSelectPalette?: (palette: StudioPaletteId) => void;
  readonly keptPalettes?: readonly StudioPaletteId[];
  readonly onVisitPalette?: (palette: StudioPaletteId) => void;
  readonly soundEnabled?: boolean;
  readonly onToggleSound?: () => void;
}): ReactNode {
  const {
    palette,
    open,
    onOpenChange,
    anchorRef,
    trigger,
    side = "top",
    align = "end",
    onOpenAppearance,
    onSelectPalette,
    keptPalettes,
    onVisitPalette,
    soundEnabled: controlledSound,
    onToggleSound,
  } = props;
  const [viewedPalette, setViewedPalette] = useState<StudioPaletteId>(palette);
  const [localSound, setLocalSound] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const soundEnabled = controlledSound ?? localSound;
  const toggleSound = useCallback(() => {
    if (onToggleSound !== undefined) {
      onToggleSound();
    } else {
      setLocalSound((prev) => !prev);
    }
  }, [onToggleSound]);

  // Sync viewed gem to the active palette whenever opened or when the app's palette changes externally.
  useEffect(() => {
    setViewedPalette(palette);
  }, [palette, open]);

  // Record private discovery stamp & play soft optional foley whenever viewing a gem inside an open vitrine.
  useEffect(() => {
    if (!open) return;
    onVisitPalette?.(viewedPalette);
    playGemFoley(viewedPalette, { enabled: soundEnabled, kind: "open" });
  }, [open, viewedPalette, onVisitPalette, soundEnabled]);

  const { entry, index, edition } = paletteMetadata(viewedPalette);
  const keptCount = keptPalettes?.length;
  const allKept =
    keptCount !== undefined && keptCount >= STUDIO_PALETTES.length;
  const isPreviewingOther = viewedPalette !== palette;

  const replay = useCallback(() => {
    setRunKey((prev) => prev + 1);
    playGemFoley(viewedPalette, { enabled: soundEnabled, kind: "open" });
  }, [viewedPalette, soundEnabled]);

  const stepPalette = useCallback(
    (delta: -1 | 1) => {
      const nextIndex =
        (index + delta + STUDIO_PALETTES.length) % STUDIO_PALETTES.length;
      const next = STUDIO_PALETTES[nextIndex];
      if (next !== undefined) {
        setViewedPalette(next.id);
      }
    },
    [index],
  );

  // Close automatically if the user turns Hidden Gems off while the vitrine is open.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    if (document.documentElement.getAttribute("data-gems") === "off") {
      onOpenChange(false);
      return;
    }
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (document.documentElement.getAttribute("data-gems") === "off") {
        onOpenChange(false);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-gems"],
    });
    return () => observer.disconnect();
  }, [open, onOpenChange]);

  const handleOpenChange: PopoverPrimitive.Root.Props["onOpenChange"] = (
    nextOpen,
    details,
  ) => {
    // When anchored to a decorative <span>, prevent outside-press on the anchor from fighting our click toggle.
    if (
      !nextOpen &&
      details.reason === "outside-press" &&
      anchorRef?.current != null &&
      details.event?.target instanceof Node &&
      anchorRef.current.contains(details.event.target)
    ) {
      details.cancel();
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      {trigger}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchorRef}
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            ref={popupRef}
            initialFocus={popupRef}
            data-slot="gem-popover"
            data-gem-popover={viewedPalette}
            data-palette={
              viewedPalette === "studio" ? undefined : viewedPalette
            }
            data-popup-open={open ? "" : undefined}
            className="mn-gem-popover origin-(--transform-origin)"
          >
            <GemStage
              palette={viewedPalette}
              runKey={runKey}
              soundEnabled={soundEnabled}
              onReplay={replay}
            />

            <div className="flex flex-col gap-1.5 px-3.5 pt-3 pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="mn-tag shrink-0">{entry.badge}</span>
                  <span className="text-micro text-fg-muted tabular-nums">
                    {APPEARANCE_STUDIO_WORDS.gemEdition(
                      edition,
                      STUDIO_PALETTES.length,
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={APPEARANCE_STUDIO_WORDS.gemPrevious}
                    onClick={() => stepPalette(-1)}
                  >
                    <ChevronLeftIcon aria-hidden="true" className="size-icon" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={APPEARANCE_STUDIO_WORDS.gemNext}
                    onClick={() => stepPalette(1)}
                  >
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-icon"
                    />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-pressed={soundEnabled}
                    aria-label={
                      soundEnabled
                        ? APPEARANCE_STUDIO_WORDS.gemSoundOn
                        : APPEARANCE_STUDIO_WORDS.gemSoundOff
                    }
                    onClick={toggleSound}
                  >
                    {soundEnabled ? (
                      <Volume2Icon
                        aria-hidden="true"
                        className="size-icon text-fg-accent"
                      />
                    ) : (
                      <VolumeXIcon aria-hidden="true" className="size-icon" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={APPEARANCE_STUDIO_WORDS.gemClose}
                    onClick={() => onOpenChange(false)}
                  >
                    <XIcon aria-hidden="true" className="size-icon" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <PopoverPrimitive.Title className="text-ui font-semibold text-fg">
                  {entry.name}
                </PopoverPrimitive.Title>
                <p className="text-micro text-fg-muted">{entry.tagline}</p>
              </div>

              <PopoverPrimitive.Description className="mn-gem-whisper mt-1">
                {entry.whisper}
              </PopoverPrimitive.Description>

              <div className="mt-0.5 flex items-center justify-between gap-2 text-micro text-fg-muted">
                <span className="truncate">
                  {APPEARANCE_STUDIO_WORDS.gemCredit(entry.iconAuthor)}
                </span>
                {keptCount === undefined ? null : (
                  <span
                    data-gem-kept={String(keptCount)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 tabular-nums",
                      allKept ? "font-medium text-fg-accent" : "text-fg-muted",
                    )}
                  >
                    {allKept ? (
                      <SparklesIcon aria-hidden="true" className="size-3" />
                    ) : null}
                    {APPEARANCE_STUDIO_WORDS.gemKeptCount(
                      keptCount,
                      STUDIO_PALETTES.length,
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line bg-chrome px-3 py-2">
              <Button type="button" size="sm" variant="ghost" onClick={replay}>
                <RotateCcwIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="size-icon"
                />
                {APPEARANCE_STUDIO_WORDS.gemReplay}
              </Button>
              {isPreviewingOther && onSelectPalette !== undefined ? (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={() => {
                    onSelectPalette(viewedPalette);
                  }}
                >
                  <CheckIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                    className="size-icon"
                  />
                  {APPEARANCE_STUDIO_WORDS.gemApplyTheme}
                </Button>
              ) : onOpenAppearance === undefined ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenAppearance();
                  }}
                >
                  <PaletteIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                    className="size-icon"
                  />
                  {APPEARANCE_STUDIO_WORDS.gemOpenAppearance}
                </Button>
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Full keyboard- and screen-reader-accessible Hidden Gem trigger button for the
 * Appearance Studio showcase banner (where interactive controls are expected).
 */
export function PaletteGemButton(props: {
  readonly palette: StudioPaletteId;
  readonly className?: string;
  readonly iconClassName?: string;
  readonly onSelectPalette?: (palette: StudioPaletteId) => void;
  readonly keptPalettes?: readonly StudioPaletteId[];
  readonly onVisitPalette?: (palette: StudioPaletteId) => void;
  readonly soundEnabled?: boolean;
  readonly onToggleSound?: () => void;
}): ReactNode {
  const {
    palette,
    className,
    iconClassName,
    onSelectPalette,
    keptPalettes,
    onVisitPalette,
    soundEnabled,
    onToggleSound,
  } = props;
  const [open, setOpen] = useState(false);
  const { entry } = paletteMetadata(palette);

  return (
    <PaletteGemPopover
      palette={palette}
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="start"
      onSelectPalette={onSelectPalette}
      keptPalettes={keptPalettes}
      onVisitPalette={onVisitPalette}
      soundEnabled={soundEnabled}
      onToggleSound={onToggleSound}
      trigger={
        <PopoverPrimitive.Trigger
          type="button"
          aria-label={APPEARANCE_STUDIO_WORDS.gemTrigger(entry.name)}
          data-palette-gem-button={palette}
          className={cn("mn-gem-trigger-btn", className)}
        >
          <HiddenGemIcon
            palette={palette}
            className={iconClassName ?? "size-icon-lg"}
          />
        </PopoverPrimitive.Trigger>
      }
    />
  );
}
