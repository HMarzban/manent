// Words for production outputs: sides export and scene range selection.
export const PRODUCTION_OUTPUTS_WORDS = Object.freeze({
  sides: "Sides",
  rangeOfScenes: "A range of scenes",
  firstScene: "First scene",
  lastScene: "Last scene",
  sceneChoice: (number: string, heading: string): string =>
    heading === "" ? `Sc. ${number}` : `Sc. ${number} · ${heading}`,
  sidesFileName: (title: string, first: string, last: string): string =>
    first === last
      ? `${title} — Sides ${first}`
      : `${title} — Sides ${first}–${last}`,
  includeInSides: "Include in sides…",
  noScenesForSides: "No scenes to pick from yet.",
} as const);
