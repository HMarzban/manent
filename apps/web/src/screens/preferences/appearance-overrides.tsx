// Format palette defaults and personal per-project palette overrides for Appearance Studio.
import {
  DEFAULT_FORMAT_PALETTES,
  FORMAT_PALETTE_KEYS,
  STUDIO_PALETTE_CHOICES,
} from "@manent/settings";
import type { FormatPaletteKey, StudioPaletteId } from "@manent/settings";
import {
  APPEARANCE_STUDIO_WORDS,
  Button,
  FORMAT_PALETTE_LABELS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useSetting,
  useSettingsStore,
  useSubscribable,
} from "@manent/ui";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { entryForPalette } from "./appearance-gallery.tsx";

function parseProjectOverrides(
  raw: string,
): Readonly<Record<string, StudioPaletteId>> {
  if (raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return {};
    const valid = new Set<string>(STUDIO_PALETTE_CHOICES.map((c) => c.value));
    const entries: [string, StudioPaletteId][] = [];
    for (const [k, v] of Object.entries(parsed))
      if (typeof v === "string" && valid.has(v))
        entries.push([k, v as StudioPaletteId]);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function AppearanceOverrides(): ReactNode {
  const store = useSettingsStore();
  const { library, userId } = useServices();
  const autoByFormat = useSetting("appearance.autoByFormat");
  const formatPalettes = useSetting("appearance.formatPalettes");
  const projectPalettesRaw = useSetting("appearance.projectPalettes");

  const projectsSource = useMemo(
    () => library.projects(userId),
    [library, userId],
  );
  const projects = useSubscribable(projectsSource);
  const projectTitles = useMemo(
    () => new Map(projects.map((p) => [p.projectId, p.title])),
    [projects],
  );

  const projectOverrides = useMemo(
    () => parseProjectOverrides(projectPalettesRaw),
    [projectPalettesRaw],
  );

  const setFormatPalette = (
    fmt: FormatPaletteKey,
    next: StudioPaletteId,
  ): void => {
    store.set("appearance.formatPalettes", {
      ...DEFAULT_FORMAT_PALETTES,
      ...formatPalettes,
      [fmt]: next,
    });
  };

  const clearProjectOverride = (projectId: string): void => {
    const next = { ...projectOverrides };
    delete next[projectId];
    const keys = Object.keys(next);
    store.set(
      "appearance.projectPalettes",
      keys.length === 0 ? "" : JSON.stringify(next),
    );
  };

  return (
    <section className="flex flex-col gap-3 rounded-surface border border-line bg-raised p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-ui font-medium text-fg">
            {APPEARANCE_STUDIO_WORDS.autoFormatLabel}
          </div>
          <div className="text-meta text-fg-muted">
            {APPEARANCE_STUDIO_WORDS.autoFormatLead}
          </div>
        </div>
        <Switch
          checked={autoByFormat}
          aria-label={APPEARANCE_STUDIO_WORDS.autoFormatLabel}
          onCheckedChange={(checked) =>
            store.set("appearance.autoByFormat", checked)
          }
        />
      </div>

      {autoByFormat ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <div className="text-meta font-medium text-fg-muted">
            {APPEARANCE_STUDIO_WORDS.formatMapHeading}
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-surface border border-line bg-chrome">
            {FORMAT_PALETTE_KEYS.map((fmt) => {
              const current =
                (formatPalettes[fmt] as StudioPaletteId | undefined) ??
                DEFAULT_FORMAT_PALETTES[fmt];
              return (
                <div
                  key={fmt}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="text-ui text-fg">
                    {FORMAT_PALETTE_LABELS[fmt]}
                  </span>
                  <Select
                    value={current}
                    onValueChange={(value) => {
                      if (typeof value === "string")
                        setFormatPalette(fmt, value as StudioPaletteId);
                    }}
                  >
                    <SelectTrigger
                      aria-label={FORMAT_PALETTE_LABELS[fmt]}
                      className="w-44"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STUDIO_PALETTE_CHOICES.map((choice) => (
                        <SelectItem key={choice.value} value={choice.value}>
                          {choice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-meta font-medium text-fg-muted">
                {APPEARANCE_STUDIO_WORDS.projectOverridesHeading}
              </span>
              <span className="text-micro text-fg-muted">
                {APPEARANCE_STUDIO_WORDS.projectOverridesNote}
              </span>
            </div>
            <div className="divide-y divide-line overflow-hidden rounded-surface border border-line bg-chrome">
              {Object.keys(projectOverrides).length === 0 ? (
                <p className="px-3 py-2 text-meta text-fg-muted">
                  {APPEARANCE_STUDIO_WORDS.projectOverridesEmpty}
                </p>
              ) : (
                Object.entries(projectOverrides).map(([projectId, palId]) => (
                  <div
                    key={projectId}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="truncate text-ui text-fg">
                      {projectTitles.get(projectId) ?? projectId}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-meta text-fg-accent">
                        {entryForPalette(palId).name}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => clearProjectOverride(projectId)}
                      >
                        {APPEARANCE_STUDIO_WORDS.matchFormatAction}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
