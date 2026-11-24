// Header and footer setting row words: presets, slot positions, slot kinds, text placeholder and switches.

export const HEADER_FOOTER_WORDS = Object.freeze({
  headerPresets: Object.freeze({
    page_number: "Page number",
    title_and_page_number: "Title and page number",
    none: "None",
    custom: "Custom",
  }),
  footerPresets: Object.freeze({
    none: "None",
    title: "Title",
    draft_name_and_date: "Draft name and date",
    custom: "Custom",
  }),
  slots: Object.freeze({
    left: "Left",
    center: "Centre",
    right: "Right",
  }),
  slotKinds: Object.freeze({
    none: "None",
    page_number: "Page number",
    page_of_total: "Page of total",
    date: "Date",
    title: "Title",
    section: "Section",
    duration: "Running time",
    revision_label: "Draft name",
    custom: "Text",
  }),
  slotTextField: "Text for this slot",
  firstPage: "On the first page too",
  rule: "With a rule",
  headerRuleLine: "A thin line under the header.",
  footerRuleLine: "A thin line over the footer.",
});
