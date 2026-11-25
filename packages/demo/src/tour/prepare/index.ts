// The Tour's preparations: each puts a scenario's document into the state it starts from, with real edits.
import type { TourPrepareResponse } from "@manent/sync-protocol";
import type { SeedDriver } from "../../seed/driver.ts";
import type { SeedTime } from "../../seed/time.ts";
import { EKBO_SCREENPLAY } from "./ekbo-screenplay.ts";
import { LAMP_ROOM_US_LETTER } from "./lamp-room-us-letter.ts";
import { EKBO_SCENE_14_SECOND_DRAFT } from "./ekbo-scene-14-second-draft.ts";
import { SALT_BLUE_READY } from "./salt-blue-ready.ts";
import { SALT_BLUE_ISSUED } from "./salt-blue-issued.ts";
import { LONG_NIGHT_PINK_READY } from "./long-night-pink-ready.ts";
import { UNDERTOW_UNLOCKED } from "./undertow-unlocked.ts";
import { YOU_FIRST_RUN } from "./you-first-run.ts";
import { WRITE_HEADER_FOOTER_READY } from "./write-header-footer-ready.ts";
import { TOGETHER_SHARE_READY } from "./together-share-ready.ts";
import { TOGETHER_STYLE_READY } from "./together-style-ready.ts";
import { WRITE_NAMES_READY } from "./write-names-ready.ts";
import { WRITE_OUTLINE_READY } from "./write-outline-ready.ts";
import { WRITE_ALTERNATES_READY } from "./write-alternates-ready.ts";
import { TOGETHER_COMMENTS_READY } from "./together-comments-ready.ts";
import { TOGETHER_SUGGEST_READY } from "./together-suggest-ready.ts";
import { TOGETHER_PRESENT_READY } from "./together-present-ready.ts";
import { TOGETHER_PRIVATE_READY } from "./together-private-ready.ts";
import { TOGETHER_NOTE_READY } from "./together-note-ready.ts";
import { NEWS_STORY_01_CHANGED } from "./news-story-01-changed.ts";

/** Run on the live server as the scenario's person, through `driver`. */
export interface TourPreparation {
  id: string;
  run(driver: SeedDriver, time: SeedTime): Promise<TourPrepareResponse>;
}

export const TOUR_PREPARATIONS: readonly TourPreparation[] = [
  EKBO_SCREENPLAY,
  LAMP_ROOM_US_LETTER,
  EKBO_SCENE_14_SECOND_DRAFT,
  SALT_BLUE_READY,
  SALT_BLUE_ISSUED,
  LONG_NIGHT_PINK_READY,
  UNDERTOW_UNLOCKED,
  YOU_FIRST_RUN,
  WRITE_HEADER_FOOTER_READY,
  TOGETHER_SHARE_READY,
  TOGETHER_STYLE_READY,
  WRITE_NAMES_READY,
  WRITE_OUTLINE_READY,
  WRITE_ALTERNATES_READY,
  TOGETHER_COMMENTS_READY,
  TOGETHER_SUGGEST_READY,
  TOGETHER_PRESENT_READY,
  TOGETHER_PRIVATE_READY,
  TOGETHER_NOTE_READY,
  NEWS_STORY_01_CHANGED,
];
