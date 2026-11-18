// Every engine version this build carries, so a script or an issued revision keeps the pages it was
// pinned to.
import {
  breaksIn,
  clusterCells,
  comparePageLabels,
  contdSuffix,
  fillUnits,
  flowUnits,
  fontSubset,
  graphemeEnd,
  labelsBetween,
  layoutPage,
  lineStartsOf,
  offFontRanges,
  pageNumberText,
  pageOf,
  pageStarts,
  paginate,
  profileFor,
  repaginate,
  resolveSpec,
  sceneNumber,
  toLayoutBlocks,
} from "./v1/index.ts";

/** Every function whose result can differ between engine versions. */
export interface Engine {
  readonly version: number;
  readonly profileFor: typeof profileFor;
  readonly toLayoutBlocks: typeof toLayoutBlocks;
  readonly resolveSpec: typeof resolveSpec;
  readonly paginate: typeof paginate;
  readonly repaginate: typeof repaginate;
  readonly layoutPage: typeof layoutPage;
  readonly pageStarts: typeof pageStarts;
  readonly pageOf: typeof pageOf;
  readonly lineStartsOf: typeof lineStartsOf;
  readonly flowUnits: typeof flowUnits;
  readonly breaksIn: typeof breaksIn;
  readonly fillUnits: typeof fillUnits;
  readonly sceneNumber: typeof sceneNumber;
  readonly contdSuffix: typeof contdSuffix;
  readonly pageNumberText: typeof pageNumberText;
  readonly comparePageLabels: typeof comparePageLabels;
  readonly labelsBetween: typeof labelsBetween;
  readonly offFontRanges: typeof offFontRanges;
  readonly fontSubset: typeof fontSubset;
  readonly graphemeEnd: typeof graphemeEnd;
  readonly clusterCells: typeof clusterCells;
}

const V1: Engine = Object.freeze({
  version: 1,
  profileFor,
  toLayoutBlocks,
  resolveSpec,
  paginate,
  repaginate,
  layoutPage,
  pageStarts,
  pageOf,
  lineStartsOf,
  flowUnits,
  breaksIn,
  fillUnits,
  sceneNumber,
  contdSuffix,
  pageNumberText,
  comparePageLabels,
  labelsBetween,
  offFontRanges,
  fontSubset,
  graphemeEnd,
  clusterCells,
});

const ENGINES: Readonly<Record<number, Engine>> = Object.freeze({ 1: V1 });

/** The engine versions this build carries, oldest first. */
export const ENGINE_VERSIONS: readonly number[] = Object.freeze(
  Object.keys(ENGINES).map(Number),
);

/** The engine a script or an issued revision is pinned to; null when this build does not carry it. */
export function engineFor(version: number): Engine | null {
  return Object.hasOwn(ENGINES, version) ? ENGINES[version]! : null;
}
