export {
  MARK_BUFFER_SIZE,
  clearMarks,
  createMarks,
  mark,
  markEnd,
  markStart,
  marksEnabled,
  readMarks,
  setMarksEnabled,
} from "./marks.ts";
export type { MarkRecord, Marks } from "./marks.ts";
export { PERF_MARKS } from "./names.ts";
export {
  INTERVAL_OPTIONS,
  bootstrapInterval,
  percentile,
  summarise,
} from "./stats.ts";
export type { Summary } from "./stats.ts";
export { timingsOf } from "./timings.ts";
export type { Timings } from "./timings.ts";
