// Preset definitions, detection and store helpers for the Header and Footer setting row.
import type {
  HeaderSlot,
  HeaderSlots,
  SettingKey,
  SettingsStore,
} from "@manent/settings";
import { HEADER_FOOTER_WORDS } from "@manent/ui";

export type HeaderFooterKey =
  "script.header" | "script.footer" | "project.header" | "project.footer";

export type SlotPosition = "left" | "center" | "right";
export type SlotKind = HeaderSlot["kind"];
export type HeaderPresetId = keyof typeof HEADER_FOOTER_WORDS.headerPresets;
export type FooterPresetId = keyof typeof HEADER_FOOTER_WORDS.footerPresets;
export type PresetId = HeaderPresetId | FooterPresetId;

export interface TripleSlots {
  readonly left: HeaderSlot;
  readonly center: HeaderSlot;
  readonly right: HeaderSlot;
}

const NONE: HeaderSlot = Object.freeze({ kind: "none" });
export const SLOT_POSITIONS: readonly SlotPosition[] = [
  "left",
  "center",
  "right",
];

export const HEADER_PRESET_SLOTS: Readonly<
  Record<Exclude<HeaderPresetId, "custom">, TripleSlots>
> = Object.freeze({
  page_number: { left: NONE, center: NONE, right: { kind: "page_number" } },
  title_and_page_number: {
    left: { kind: "title" },
    center: NONE,
    right: { kind: "page_number" },
  },
  none: { left: NONE, center: NONE, right: NONE },
});

export const FOOTER_PRESET_SLOTS: Readonly<
  Record<Exclude<FooterPresetId, "custom">, TripleSlots>
> = Object.freeze({
  none: { left: NONE, center: NONE, right: NONE },
  title: { left: NONE, center: { kind: "title" }, right: NONE },
  draft_name_and_date: {
    left: { kind: "revision_label" },
    center: NONE,
    right: { kind: "date" },
  },
});

export const HEADER_PRESET_ITEMS = Object.freeze(
  (Object.keys(HEADER_FOOTER_WORDS.headerPresets) as HeaderPresetId[]).map(
    (value) => ({ value, label: HEADER_FOOTER_WORDS.headerPresets[value] }),
  ),
);

export const FOOTER_PRESET_ITEMS = Object.freeze(
  (Object.keys(HEADER_FOOTER_WORDS.footerPresets) as FooterPresetId[]).map(
    (value) => ({ value, label: HEADER_FOOTER_WORDS.footerPresets[value] }),
  ),
);

export const SLOT_KIND_ITEMS = Object.freeze(
  (Object.keys(HEADER_FOOTER_WORDS.slotKinds) as SlotKind[]).map((value) => ({
    value,
    label: HEADER_FOOTER_WORDS.slotKinds[value],
  })),
);

export function isHeaderFooterKey(key: SettingKey): key is HeaderFooterKey {
  return (
    key === "script.header" ||
    key === "script.footer" ||
    key === "project.header" ||
    key === "project.footer"
  );
}

function sameSlot(a: HeaderSlot, b: HeaderSlot): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "custom" && b.kind === "custom") return a.text === b.text;
  return true;
}

function sameTriple(a: TripleSlots, b: TripleSlots): boolean {
  return (
    sameSlot(a.left, b.left) &&
    sameSlot(a.center, b.center) &&
    sameSlot(a.right, b.right)
  );
}

export function detectPreset(slots: HeaderSlots, isHeader: boolean): PresetId {
  if (isHeader) {
    for (const id of Object.keys(HEADER_PRESET_SLOTS) as Exclude<
      HeaderPresetId,
      "custom"
    >[]) {
      if (sameTriple(slots, HEADER_PRESET_SLOTS[id])) return id;
    }
    return "custom";
  }
  for (const id of Object.keys(FOOTER_PRESET_SLOTS) as Exclude<
    FooterPresetId,
    "custom"
  >[]) {
    if (sameTriple(slots, FOOTER_PRESET_SLOTS[id])) return id;
  }
  return "custom";
}

export function writeHeaderSlots(
  store: SettingsStore,
  key: HeaderFooterKey,
  next: HeaderSlots,
): boolean {
  switch (key) {
    case "script.header":
      return store.set("script.header", next).ok;
    case "script.footer":
      return store.set("script.footer", next).ok;
    case "project.header":
      return store.set("project.header", next).ok;
    case "project.footer":
      return store.set("project.footer", next).ok;
  }
}

export function slotForKind(kind: SlotKind, previous: HeaderSlot): HeaderSlot {
  if (kind === "custom") {
    return {
      kind: "custom",
      text: previous.kind === "custom" ? previous.text : "",
    };
  }
  return { kind };
}

export function presetLabel(preset: PresetId, isHeader: boolean): string {
  if (isHeader) {
    return HEADER_FOOTER_WORDS.headerPresets[preset as HeaderPresetId];
  }
  return HEADER_FOOTER_WORDS.footerPresets[preset as FooterPresetId];
}
