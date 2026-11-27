// Appearance Studio gallery: miniature window preview, 24-palette filter tablist, radiogroup and semantic marks proof.
import type { StudioPaletteId } from "@manent/settings";
import {
  APPEARANCE_STUDIO_WORDS,
  Button,
  HiddenGemIcon,
  PaletteGemButton,
  STUDIO_CATEGORY_LABELS,
  STUDIO_CATEGORY_ORDER,
  STUDIO_PALETTES,
} from "@manent/ui";
import type { StudioPaletteCategory, StudioPaletteEntry } from "@manent/ui";
import { CheckIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useGemCollector } from "../../shell/app-palette-gem.tsx";

function gridColumnCount(grid: HTMLElement, fallback: number): number {
  const view = grid.ownerDocument.defaultView;
  if (view === null || typeof view.getComputedStyle !== "function")
    return fallback;
  const cols = view
    .getComputedStyle(grid)
    .gridTemplateColumns.trim()
    .split(/\s+/)
    .filter((token) => token !== "" && token !== "none").length;
  return cols > 0 ? cols : fallback;
}

export function entryForPalette(id: StudioPaletteId): StudioPaletteEntry {
  return (
    STUDIO_PALETTES.find((entry) => entry.id === id) ?? STUDIO_PALETTES[0]!
  );
}

/** Miniature cropped Manent window preview rendered with real data-palette + data-theme tokens. */
export function MiniWindow(props: {
  palette: StudioPaletteId;
  scheme: "light" | "dark";
  showGem: boolean;
}): ReactNode {
  return (
    <div
      className="mn-mini-win"
      data-palette={props.palette === "studio" ? undefined : props.palette}
      data-theme={props.scheme}
    >
      <div className="mn-mini-side">
        <div className="flex gap-1">
          <span className="size-1 rounded-full bg-fg-muted opacity-35" />
          <span className="size-1 rounded-full bg-fg-muted opacity-35" />
          <span className="size-1 rounded-full bg-fg-muted opacity-35" />
        </div>
        <div className="h-1.5 w-3/4 rounded-full bg-fg opacity-60" />
        <div className="flex h-2 w-full items-center rounded-control bg-selected px-1">
          <span className="h-1 w-3/4 rounded-full bg-accent-solid" />
        </div>
        {props.showGem ? (
          <span className="mn-card-gem mn-gem-only mt-auto inline-flex">
            <HiddenGemIcon palette={props.palette} className="size-icon-lg" />
          </span>
        ) : null}
      </div>
      <div className="mn-mini-main">
        <div className="mn-mini-paper">
          <div className="mn-mini-line" />
          <div className="mn-mini-line-muted w-full" />
          <div className="mn-mini-line-muted w-4/5" />
          <div className="mn-mini-line-sel" />
        </div>
      </div>
    </div>
  );
}

export function AppearanceGallery(props: {
  palette: StudioPaletteId;
  effectiveScheme: "light" | "dark";
  gems: boolean;
  onPickPalette(next: StudioPaletteId, originEl: HTMLElement | null): void;
}): ReactNode {
  const { palette, effectiveScheme, gems, onPickPalette } = props;
  const [category, setCategory] = useState<StudioPaletteCategory>("all");
  const paletteHeadingId = useId();
  const activeEntry = entryForPalette(palette);
  const collector = useGemCollector();

  const visiblePalettes = useMemo(
    () =>
      category === "all"
        ? STUDIO_PALETTES
        : STUDIO_PALETTES.filter((entry) =>
            entry.categories.includes(category),
          ),
    [category],
  );

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const idx = STUDIO_CATEGORY_ORDER.indexOf(category);
    let nextIdx = idx;
    if (event.key === "ArrowRight")
      nextIdx = (idx + 1) % STUDIO_CATEGORY_ORDER.length;
    else if (event.key === "ArrowLeft")
      nextIdx =
        (idx - 1 + STUDIO_CATEGORY_ORDER.length) % STUDIO_CATEGORY_ORDER.length;
    else if (event.key === "Home") nextIdx = 0;
    else if (event.key === "End") nextIdx = STUDIO_CATEGORY_ORDER.length - 1;
    else return;
    event.preventDefault();
    const nextCat = STUDIO_CATEGORY_ORDER[nextIdx];
    if (nextCat === undefined) return;
    setCategory(nextCat);
    const tabs = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    ];
    tabs[nextIdx]?.focus();
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const cards = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ];
    const idx = cards.indexOf(event.target as HTMLButtonElement);
    if (idx === -1) return;
    const cols = gridColumnCount(event.currentTarget, 3);
    let next = idx;
    if (event.key === "ArrowRight") next = (idx + 1) % cards.length;
    else if (event.key === "ArrowLeft")
      next = (idx - 1 + cards.length) % cards.length;
    else if (event.key === "ArrowDown")
      next = Math.min(cards.length - 1, idx + cols);
    else if (event.key === "ArrowUp") next = Math.max(0, idx - cols);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = cards.length - 1;
    else return;
    event.preventDefault();
    const nextCard = cards[next];
    const nextEntry = visiblePalettes[next];
    nextCard?.focus();
    if (nextEntry !== undefined) onPickPalette(nextEntry.id, nextCard ?? null);
  };

  return (
    <>
      <section
        aria-labelledby={paletteHeadingId}
        className="flex flex-col gap-3"
      >
        <div>
          <h3 id={paletteHeadingId} className="text-title font-medium text-fg">
            {APPEARANCE_STUDIO_WORDS.paletteHeading}
          </h3>
          <p className="text-meta text-fg-muted">
            {APPEARANCE_STUDIO_WORDS.paletteLead}
          </p>
        </div>

        <div
          role="tablist"
          aria-label={APPEARANCE_STUDIO_WORDS.filterLabel}
          onKeyDown={onTabKeyDown}
          className="flex flex-wrap items-center gap-1"
        >
          {STUDIO_CATEGORY_ORDER.map((cat) => {
            const selected = cat === category;
            return (
              <Button
                key={cat}
                type="button"
                role="tab"
                size="sm"
                variant={selected ? "secondary" : "ghost"}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setCategory(cat)}
              >
                {STUDIO_CATEGORY_LABELS[cat]}
              </Button>
            );
          })}
        </div>

        <div
          role="radiogroup"
          aria-labelledby={paletteHeadingId}
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {visiblePalettes.map((entry, index) => {
            const checked = entry.id === palette;
            const focusable =
              checked ||
              (!visiblePalettes.some((p) => p.id === palette) && index === 0);
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={focusable ? 0 : -1}
                onClick={(event) =>
                  onPickPalette(entry.id, event.currentTarget)
                }
                className="mn-palette-card flex cursor-pointer flex-col"
              >
                <div
                  className="h-24 w-full overflow-hidden border-b border-line bg-desk pt-2.5 pl-2.5"
                  data-palette={entry.id === "studio" ? undefined : entry.id}
                  data-theme={effectiveScheme}
                >
                  <MiniWindow
                    palette={entry.id}
                    scheme={effectiveScheme}
                    showGem={gems}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={
                        checked
                          ? "flex min-w-0 items-center gap-1.5 text-ui font-medium text-fg-accent"
                          : "flex min-w-0 items-center gap-1.5 text-ui font-medium text-fg"
                      }
                    >
                      <span className="truncate">{entry.name}</span>
                      {checked ? (
                        <CheckIcon
                          aria-hidden="true"
                          className="size-icon shrink-0"
                        />
                      ) : null}
                    </span>
                    <span className="shrink-0 text-micro text-fg-muted">
                      {entry.badge}
                    </span>
                  </div>
                  <span className="text-meta text-fg-muted">
                    {entry.tagline}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col justify-between gap-4 rounded-surface border border-line bg-raised p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {gems ? (
            <PaletteGemButton
              palette={activeEntry.id}
              className="size-avatar-lg"
              onSelectPalette={(next) => onPickPalette(next, null)}
              keptPalettes={collector.keptPalettes}
              onVisitPalette={collector.onVisitPalette}
              soundEnabled={collector.soundEnabled}
              onToggleSound={collector.onToggleSound}
            />
          ) : (
            <div className="flex size-avatar-lg shrink-0 items-center justify-center rounded-surface border border-line bg-well text-fg-accent">
              <HiddenGemIcon
                palette={activeEntry.id}
                className="size-icon-lg"
              />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-ui font-medium text-fg">
              <span>{activeEntry.name}</span>
              <span className="text-meta font-normal text-fg-muted">
                {activeEntry.badge}
              </span>
            </div>
            <p className="text-meta text-fg-muted">{activeEntry.tagline}</p>
            {gems ? (
              <p className="mn-gem-only text-meta italic text-fg-accent">
                {activeEntry.whisper}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mn-pages shrink-0 sm:w-64">
          <div className="mn-proof-sheet">
            <div className="font-semibold">
              {APPEARANCE_STUDIO_WORDS.proofHeading}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-micro">
              <span className="mn-proof-sel">
                {APPEARANCE_STUDIO_WORDS.proofSelected}
              </span>
              <span className="mn-proof-comment">
                {APPEARANCE_STUDIO_WORDS.proofComment}
              </span>
              <span className="mn-proof-added">
                {APPEARANCE_STUDIO_WORDS.proofAdded}
              </span>
              <span className="mn-proof-removed">
                {APPEARANCE_STUDIO_WORDS.proofRemoved}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
