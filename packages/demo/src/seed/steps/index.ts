// The seed's steps, one line each, in the order they run; each step's own file sits beside this one.
import type { SeedStep } from "../seed.ts";
import { MEMBERS_STEP } from "./members.ts";
import { EVERY_KEY_BUT_ONE } from "./every-key-but-one.ts";
import { JUMPOX } from "./jumpox.ts";
import { HANDED_IN } from "./handed-in.ts";
import { DOWN_THE_BACK } from "./down-the-back.ts";
import { THE_LONG_NIGHT } from "./the-long-night.ts";
import { HARBOUR_LIGHTS } from "./harbour-lights.ts";
import { THE_LATE_DESK } from "./the-late-desk.ts";
import { LANNICK_ONE_NEWS } from "./lannick-one-news.ts";
import { GAME_SAMPLES } from "./game-samples.ts";
import { THE_LAMP_ROOM } from "./the-lamp-room.ts";
import { STUDIO } from "./studio.ts";
import { THE_LATE_DESK_RUNDOWNS } from "./the-late-desk-rundowns.ts";
import { LANNICK_ONE_NEWS_RUNDOWNS } from "./lannick-one-news-rundowns.ts";
import { HANDED_IN_TIMING } from "./handed-in-timing.ts";
import { HEAVY_RUNDOWNS_STEP } from "./heavy-rundowns.ts";
import { SAMS_DESK_TOGETHER } from "./sams-desk-together.ts";
import { LONG_NIGHT_TOGETHER } from "./long-night-together.ts";
import { MONOLOGUE_MATERIAL } from "./monologue-material.ts";
import { LAMP_ROOM_COMMENTS } from "./lamp-room-comments.ts";
import { HARBOUR_LIGHTS_SERIES } from "./harbour-lights-series.ts";
import { HARBOUR_LIGHTS_ROOM } from "./harbour-lights-room.ts";
import { HEAVY_SERIES } from "./heavy-series.ts";

export const SEED_STEPS: readonly SeedStep[] = [
  MEMBERS_STEP,
  EVERY_KEY_BUT_ONE,
  JUMPOX,
  HANDED_IN,
  DOWN_THE_BACK,
  THE_LONG_NIGHT,
  HARBOUR_LIGHTS,
  THE_LATE_DESK,
  LANNICK_ONE_NEWS,
  GAME_SAMPLES,
  THE_LAMP_ROOM,
  STUDIO,
  THE_LATE_DESK_RUNDOWNS,
  LANNICK_ONE_NEWS_RUNDOWNS,
  HANDED_IN_TIMING,
  HEAVY_RUNDOWNS_STEP,
  SAMS_DESK_TOGETHER,
  LONG_NIGHT_TOGETHER,
  MONOLOGUE_MATERIAL,
  LAMP_ROOM_COMMENTS,
  HARBOUR_LIGHTS_SERIES,
  HARBOUR_LIGHTS_ROOM,
  HEAVY_SERIES,
];
