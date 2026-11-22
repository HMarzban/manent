// What a search in Preferences finds that is not a preference: where a setting lives, or why there is nothing to set.
import type { SearchPointer } from "../registry.ts";

export const POINTERS: readonly SearchPointer[] = Object.freeze([
  {
    label: "Paper size",
    keywords: ["paper", "a4", "letter"],
    kind: "elsewhere",
    says: "Script settings — shared with everyone on the script",
    opens: "doc.scriptSettings",
  },
  {
    label: "Auto-save",
    keywords: ["autosave", "auto-save", "save"],
    kind: "answer",
    says: "Nothing to set. Manent saves every keystroke on this device before it is sent. The status beside the title says where your work is.",
    opens: null,
  },
  {
    label: "Backup",
    keywords: ["backup", "back up"],
    kind: "answer",
    says: "Nothing to set. Every keystroke is saved on this device, and a synced script is also on the server. The status beside the title says where your work is.",
    opens: null,
  },
  {
    label: "Font",
    keywords: ["font", "typeface", "courier"],
    kind: "answer",
    says: "Nothing to set. Scripts are always set in Courier Prime, so the pages print as they look. Interface size changes the text around the page.",
    opens: null,
  },
  {
    label: "Auto-capitalise",
    keywords: [
      "auto-capitalise",
      "autocapitalise",
      "capitalise",
      "capitalize",
      "capitals",
    ],
    kind: "answer",
    says: "Nothing to set. Manent keeps the letters you type; a format shows an element in capitals where the industry does.",
    opens: null,
  },
  {
    label: "Smart quotes",
    keywords: ["smart quotes", "quotes", "apostrophes"],
    kind: "answer",
    says: "Nothing to set. Quotes and apostrophes are kept as you type them, so files you import and export match.",
    opens: null,
  },
  {
    label: "Autocomplete",
    keywords: ["autocomplete", "auto-complete", "suggestions"],
    kind: "answer",
    says: "Nothing to set. Names, scene headings and transitions are offered from your script as you type; Esc closes the list.",
    opens: null,
  },
  {
    label: "Reduce motion",
    keywords: ["reduce motion", "motion", "animation", "accessibility"],
    kind: "answer",
    says: "Nothing to set. Manent follows your system: turn on reduced motion there.",
    opens: null,
  },
  {
    label: "Contrast",
    keywords: ["contrast", "high contrast", "accessibility"],
    kind: "answer",
    says: "Nothing to set. Manent follows your system: turn on more contrast there.",
    opens: null,
  },
  {
    label: "Language",
    keywords: ["language", "spelling language"],
    kind: "answer",
    says: "Nothing to set. Manent is in English in this release; spelling follows your system's language.",
    opens: null,
  },
  {
    label: "Date format",
    keywords: ["date format", "dates"],
    kind: "answer",
    says: "Dates in a script follow its project's date format, in Project settings → Format and style.",
    opens: null,
  },
  {
    label: "Updates",
    keywords: ["updates", "update", "version"],
    kind: "answer",
    says: {
      desktop:
        "Nothing to set. Manent updates itself the next time it starts; This device shows which Manent you have and its channel.",
      web: "Nothing to set. Manent updates once every Manent tab has been closed.",
    },
    opens: null,
  },
  {
    label: "Usage data",
    keywords: ["usage data", "telemetry", "analytics", "tracking"],
    kind: "answer",
    says: "Nothing to set. Manent sends no usage data.",
    opens: null,
  },
  {
    label: "Notifications",
    keywords: ["notifications", "email", "mentions"],
    kind: "answer",
    says: "Nothing to set here. A workspace's owners choose where comments and mentions go, in Workspace settings → Notifications.",
    opens: null,
  },
]);
