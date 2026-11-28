// Appearance Studio pane: Dark/Light squircles with Two-Tier View Transitions, Follow system,
// White page, Hidden Gems, 24-palette studio gallery and format/project overrides.
import type { StudioPaletteId } from "@manent/settings";
import {
  APPEARANCE_STUDIO_WORDS,
  PREFERENCES_WORDS,
  Switch,
  useSetting,
  useSettingsStore,
} from "@manent/ui";
import { useId } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { AppearanceGallery, MiniWindow } from "./appearance-gallery.tsx";
import { AppearanceOverrides } from "./appearance-overrides.tsx";
import { FORCED_COLOURS, useMediaQuery } from "./device-pane.tsx";
import { runAppearanceTransition } from "./view-transition.ts";

const DARK_MEDIA = "(prefers-color-scheme: dark)";

export function AppearancePane(): ReactNode {
  const store = useSettingsStore();
  const themeChoice = useSetting("appearance.theme");
  const palette = useSetting("appearance.palette");
  const whitePage = useSetting("appearance.whitePage");
  const gems = useSetting("appearance.gems");

  const systemDark = useMediaQuery(DARK_MEDIA);
  const forced = useMediaQuery(FORCED_COLOURS);
  const effectiveScheme: "light" | "dark" =
    themeChoice === "system" ? (systemDark ? "dark" : "light") : themeChoice;
  const schemeHeadingId = useId();

  const pickScheme = (
    next: "light" | "dark",
    originEl: HTMLElement | null,
  ): void => {
    if (themeChoice === next) return;
    if (effectiveScheme === next) {
      store.set("appearance.theme", next);
      return;
    }
    runAppearanceTransition({
      originEl,
      kind: "iris",
      mutate: () => {
        store.set("appearance.theme", next);
      },
    });
  };

  const toggleFollowSystem = (checked: boolean): void => {
    if (checked) {
      const target: "light" | "dark" = systemDark ? "dark" : "light";
      if (target !== effectiveScheme) {
        runAppearanceTransition({
          kind: "iris",
          mutate: () => {
            store.set("appearance.theme", "system");
          },
        });
      } else {
        store.set("appearance.theme", "system");
      }
      return;
    }
    store.set("appearance.theme", effectiveScheme);
  };

  const pickPalette = (
    next: StudioPaletteId,
    originEl: HTMLElement | null,
  ): void => {
    if (next === palette) return;
    runAppearanceTransition({
      originEl,
      kind: "crossfade",
      mutate: () => {
        store.set("appearance.palette", next);
      },
    });
  };

  const onSchemeKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll("button")];
    const nextIdx = event.target === buttons[0] ? 1 : 0;
    const nextBtn = buttons[nextIdx];
    nextBtn?.focus();
    pickScheme(nextIdx === 0 ? "dark" : "light", nextBtn ?? null);
  };

  const systemNowLabel = systemDark
    ? APPEARANCE_STUDIO_WORDS.darkMode
    : APPEARANCE_STUDIO_WORDS.lightMode;
  const activeSchemeLabel =
    effectiveScheme === "dark"
      ? APPEARANCE_STUDIO_WORDS.darkMode
      : APPEARANCE_STUDIO_WORDS.lightMode;

  return (
    <div className="flex flex-col gap-6">
      {forced ? (
        <p className="rounded-surface border border-line-strong bg-raised px-3 py-2 text-ui text-fg">
          {PREFERENCES_WORDS.contrastNote}
        </p>
      ) : null}

      <section
        aria-labelledby={schemeHeadingId}
        data-tour="setting:appearance.theme"
        className="flex flex-col gap-5 rounded-surface border border-line bg-raised p-4"
      >
        <div>
          <h3 id={schemeHeadingId} className="text-title font-medium text-fg">
            {APPEARANCE_STUDIO_WORDS.schemeHeading}
          </h3>
          <p className="text-meta text-fg-muted">
            {APPEARANCE_STUDIO_WORDS.schemeLead}
          </p>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={schemeHeadingId}
          onKeyDown={onSchemeKeyDown}
          className="flex flex-wrap items-center justify-center gap-6 py-1"
        >
          {(["dark", "light"] as const).map((mode) => {
            const active = effectiveScheme === mode;
            const label =
              mode === "dark"
                ? APPEARANCE_STUDIO_WORDS.darkMode
                : APPEARANCE_STUDIO_WORDS.lightMode;
            return (
              <div key={mode} className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  tabIndex={active ? 0 : -1}
                  data-palette={palette === "studio" ? undefined : palette}
                  data-theme={mode}
                  onClick={(event) => pickScheme(mode, event.currentTarget)}
                  className="mn-scheme-squircle cursor-pointer"
                >
                  <MiniWindow palette={palette} scheme={mode} showGem={gems} />
                </button>
                <span
                  className={
                    active
                      ? "text-meta font-medium text-fg"
                      : "text-meta text-fg-muted"
                  }
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ui font-medium text-fg">
                {APPEARANCE_STUDIO_WORDS.followSystem}
              </div>
              <div className="text-meta text-fg-muted">
                {themeChoice === "system"
                  ? PREFERENCES_WORDS.systemNow(systemNowLabel)
                  : APPEARANCE_STUDIO_WORDS.manualScheme(activeSchemeLabel)}
              </div>
            </div>
            <Switch
              checked={themeChoice === "system"}
              aria-label={APPEARANCE_STUDIO_WORDS.followSystem}
              onCheckedChange={toggleFollowSystem}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ui font-medium text-fg">
                {APPEARANCE_STUDIO_WORDS.whitePageLabel}
              </div>
              <div className="text-meta text-fg-muted">
                {effectiveScheme === "light"
                  ? APPEARANCE_STUDIO_WORDS.whitePageLightHint
                  : APPEARANCE_STUDIO_WORDS.whitePageLead}
              </div>
            </div>
            <Switch
              checked={whitePage}
              aria-label={APPEARANCE_STUDIO_WORDS.whitePageLabel}
              onCheckedChange={(checked) =>
                store.set("appearance.whitePage", checked)
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ui font-medium text-fg">
                {APPEARANCE_STUDIO_WORDS.gemsLabel}
              </div>
              <div className="text-meta text-fg-muted">
                {APPEARANCE_STUDIO_WORDS.gemsLead}
              </div>
            </div>
            <Switch
              checked={gems}
              aria-label={APPEARANCE_STUDIO_WORDS.gemsLabel}
              onCheckedChange={(checked) =>
                store.set("appearance.gems", checked)
              }
            />
          </div>
        </div>
      </section>

      <AppearanceGallery
        palette={palette}
        effectiveScheme={effectiveScheme}
        gems={gems}
        onPickPalette={pickPalette}
      />

      <AppearanceOverrides />
    </div>
  );
}
