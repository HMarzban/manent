// The Tour's Long documents scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { LONG_TYPE_2000 } from "./long-type-2000.ts";
import { LONG_BOOK } from "./long-book.ts";
import { LONG_BUSY_WORKSPACE } from "./long-busy-workspace.ts";
import { LONG_FIND } from "./long-find.ts";
import { LONG_GO_TO } from "./long-go-to.ts";
import { LONG_SEARCH } from "./long-search.ts";

export const LONG: readonly TourScenario[] = [
  LONG_TYPE_2000,
  LONG_BOOK,
  LONG_BUSY_WORKSPACE,
  LONG_FIND,
  LONG_GO_TO,
  LONG_SEARCH,
];
