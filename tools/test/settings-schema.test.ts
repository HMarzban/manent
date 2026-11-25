import { expect, test } from "bun:test";
import type { DateFormat, PageFurnitureOptions } from "@manent/editor";
import type {
  PdfDateFormat,
  PdfHeaderSlot,
  PdfHeaderSlotKind,
  PdfHeaderSlots,
  PdfOptions,
} from "@manent/formats";
import { FORMATS } from "@manent/schema";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import type { HeaderSlot, HeaderSlots, SettingValue } from "@manent/settings";

test("the format choices are the schema's formats", () => {
  expect(
    SETTINGS.get("script.format").type.choices!.map((c) => c.value),
  ).toEqual([...FORMATS]);
});

function toPdfFurnitureOptions(
  opts: Pick<PageFurnitureOptions, "header" | "footer" | "dateFormat">,
): Pick<PdfOptions, "header" | "footer" | "dateFormat"> {
  return opts;
}

test("header and footer slot kinds and date formats align across settings, editor and formats", () => {
  const kinds: readonly PdfHeaderSlotKind[] = [
    "none",
    "page_number",
    "page_of_total",
    "date",
    "title",
    "section",
    "duration",
    "revision_label",
  ];
  const emptyBag = createMemoryBag({ initial: {}, writable: () => true });
  const store = createSettingsStore({
    registry: SETTINGS,
    bags: {
      personal: emptyBag,
      device: emptyBag,
      script: emptyBag,
      project: null,
    },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  const slotType = SETTINGS.get("script.header").type;
  for (const kind of kinds) {
    const input: PdfHeaderSlots = {
      left: { kind },
      center: { kind: "custom", text: "Studio" },
      right: { kind: "none" },
      firstPage: false,
      rule: false,
    };
    const parsed = slotType.parse(input);
    expect(parsed.ok).toBe(true);
    const settingsSlots: SettingValue<"script.header"> = input;
    expect(store.set("script.header", settingsSlots)).toEqual({ ok: true });
    const stored: HeaderSlots = store.get("script.header");
    const pdfSlots: PdfHeaderSlots = stored;
    const backToSettings: HeaderSlots = pdfSlots;
    const pdfSlot: PdfHeaderSlot = stored.left;
    const backSlot: HeaderSlot = pdfSlot;
    expect(backToSettings).toEqual(input);
    expect(backSlot).toEqual(input.left);
  }
  const dateFormat: SettingValue<"script.dateFormat"> =
    store.get("script.dateFormat");
  const editorDate: DateFormat = dateFormat;
  const pdfDate: PdfDateFormat = editorDate;
  const backDate: SettingValue<"script.dateFormat"> = pdfDate;
  expect(backDate).toBe("day_month_year");
  expect(
    toPdfFurnitureOptions({ header: null, footer: null, dateFormat: null }),
  ).toEqual({
    header: null,
    footer: null,
    dateFormat: null,
  });
});
