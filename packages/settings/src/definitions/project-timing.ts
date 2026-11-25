// Project-level timing settings: the read rate used by Variety and Podcast read-rate timing.
import { setting } from "../define.ts";
import { t } from "../types.ts";

// Repeated from @manent/pagination's DEFAULT_READ_RATE: settings is L0 and may not import pagination.
const DEFAULT_READ_RATE = 11.25;

export const PROJECT_TIMING_SETTINGS = Object.freeze([
  setting({
    key: "project.readRate",
    scope: "project",
    type: t.number({ min: 1, max: 50, step: 0.01 }),
    default: DEFAULT_READ_RATE,
    label: "Read rate",
    description: "Characters a second, for timing Variety scripts.",
    noun: "read rate",
    surfaces: [{ in: "projectSettings", group: "format_style", order: 110 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
] as const);
