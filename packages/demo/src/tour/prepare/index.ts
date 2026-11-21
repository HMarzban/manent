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
];
