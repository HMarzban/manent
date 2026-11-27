// Applies a personal project override or format-matched studio palette while an uncovered document is open,
// without mutating the person's global `appearance.palette` preference.
import { DEFAULT_FORMAT_PALETTES, STUDIO_PALETTE_IDS } from "@manent/settings";
import type { FormatPaletteKey, StudioPaletteId } from "@manent/settings";
import { createValue, useSetting, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useEffect, useMemo } from "react";
import { useServices } from "../services/context.tsx";
import type { ProjectKind } from "../services/ports.ts";

const NO_STRING: Subscribable<string | null> = createValue(null);
const NO_KIND: Subscribable<ProjectKind | null> = createValue(null);
const VALID_PALETTES: ReadonlySet<string> = new Set(STUDIO_PALETTE_IDS);

const KIND_TO_FORMAT_KEY: Readonly<Record<ProjectKind, FormatPaletteKey>> =
  Object.freeze({
    film: "screenplay",
    series: "multicam",
    stage_play: "stage",
    book: "manuscript",
    podcast: "variety",
    game: "game",
    show: "show",
    news: "news",
  });

function projectOverrideFor(
  raw: string,
  projectId: string | null,
): StudioPaletteId | null {
  if (projectId === null || raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null;
    const value = Reflect.get(parsed, projectId);
    return typeof value === "string" && VALID_PALETTES.has(value)
      ? (value as StudioPaletteId)
      : null;
  } catch {
    return null;
  }
}

function writePaletteAttr(palette: StudioPaletteId): void {
  const root = document.documentElement;
  if (palette === "studio") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", palette);
}

/** Resolves and applies the effective studio palette for the currently visible document, restoring the global palette when leaving it. */
export function useProjectPalette(options: {
  readonly docId: string | null;
  readonly covered: boolean;
}): void {
  const { docId, covered } = options;
  const { library } = useServices();
  const globalPalette = useSetting("appearance.palette");
  const autoByFormat = useSetting("appearance.autoByFormat");
  const formatPalettes = useSetting("appearance.formatPalettes");
  const projectPalettesRaw = useSetting("appearance.projectPalettes");

  const projectSource = useMemo(
    () => (docId === null ? NO_STRING : library.documentProject(docId)),
    [library, docId],
  );
  const kindSource = useMemo(
    () => (docId === null ? NO_KIND : library.documentKind(docId)),
    [library, docId],
  );
  const projectId = useSubscribable(projectSource);
  const projectKind = useSubscribable(kindSource);

  useEffect(() => {
    if (docId === null || covered) return;
    const override = projectOverrideFor(projectPalettesRaw, projectId);
    let target: StudioPaletteId | null = override;
    if (target === null && autoByFormat && projectKind !== null) {
      const fmtKey = KIND_TO_FORMAT_KEY[projectKind];
      const configured = formatPalettes[fmtKey];
      target =
        typeof configured === "string" && VALID_PALETTES.has(configured)
          ? (configured as StudioPaletteId)
          : DEFAULT_FORMAT_PALETTES[fmtKey];
    }
    if (target === null || target === globalPalette) return;
    writePaletteAttr(target);
    return () => {
      writePaletteAttr(globalPalette);
    };
  }, [
    docId,
    covered,
    projectId,
    projectKind,
    globalPalette,
    autoByFormat,
    formatPalettes,
    projectPalettesRaw,
  ]);
}
