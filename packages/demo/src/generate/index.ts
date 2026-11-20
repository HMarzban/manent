// Style guides and phrase banks: their shapes, and the bank of every generated project.
export { SeedBuildError } from "./guide.ts";
export type {
  Beat,
  DialogueEntry,
  GeneratedIssue,
  LineIntent,
  ProseGuide,
  StyleGuide,
  StyleRules,
  VarietyStory,
} from "./guide.ts";
export {
  EKBO_GUIDE,
  JUMPOX_GUIDE,
  HANDED_IN_GUIDE,
} from "./banks/small/index.ts";
export {
  LONG_NIGHT_GUIDE,
  HARBOUR_LIGHTS_GUIDE,
  LAMP_ROOM_GUIDE,
  TWELVE_ON_FOOT_GUIDE,
  LATE_DESK_GUIDE,
  NEWS_GUIDE,
} from "./banks/medium/index.ts";
export {
  NED_ASHBY_GUIDE,
  NED_PROSE,
  EMBER_FLEET_GUIDE,
  KEEPER_GUIDE,
  KEEPER_PROSE,
  WARD_NINE_GUIDE,
  LARCH_ROAD_GUIDE,
  MOSS_AND_PEBBLE_GUIDE,
  LIVE_GUIDE,
  DOWN_THE_TOLLE_GUIDE,
  SLATE_GUIDES,
} from "./banks/heavy/index.ts";
