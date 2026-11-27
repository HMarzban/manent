// Content for the two new Writers' room series showcase projects:
// Platform Two (Multi-camera Series) and Tin Boat (Animation Series with Record draft + Pickup lines).
import type { SeasonEntry } from "@manent/crdt";
import type {
  SeedBoardCard,
  SeedBoardStoryline,
  SeedProjectName,
} from "../../seed/capabilities/series.ts";

// ---------------------------------------------------------------------------
// Platform Two — Multi-camera Series (`multicam`)
// ---------------------------------------------------------------------------

export const PLATFORM_TWO_101_TABLE = `
act_break TEASER
scene_heading INT. LANNICK CENTRAL CONCOURSE - MORNING
action THE TICKET KIOSK BESIDE PLATFORM TWO. COMMUTERS STREAM PAST UNDER A BOARD THAT READS "09:14 — PLATFORM 2 (PROBABLY)".
action CLAIRE (30s), STATION DUTY MANAGER, ADJUSTS HER HIGH-VIS WAISTCOAT AS BARRY (50s), ANNOUNCER, PEERS OUT OF THE BOOTH HOLDING TWO DIFFERENT MUGS.
character BARRY
dialogue Did anybody tell the nine-fourteen it's meant to have four carriages today?
character CLAIRE
dialogue It has four carriages, Barry.
character BARRY
dialogue Then two of them are hiding behind the milk float in the siding.
character CLAIRE
parenthetical (checking her clipboard)
dialogue Right. Nobody panic. Tell platform two to move briskly down to the front.
character BARRY
dialogue Briskly is optimistic for a Tuesday in rain.
act_break ACT ONE
scene_heading INT. ANNOUNCER'S BOOTH - CONTINUOUS
action A CRAMPED GLASS BOX OVERLOOKING THE TRACKS. MICROPHONE ON A GOOSENECK, THREE TIMETABLE BINDERS, AND A KETTLE THAT WHISTLES IN B-FLAT.
action DEAN (20s), NEW TRAINEE, STARES AT A ROW OF TWELVE IDENTICAL SWITCHES.
character DEAN
dialogue Which button talks to platform two and which one talks to the staff canteen?
character BARRY
dialogue Green is platform two. Yellow is the canteen. Never press both unless you want forty commuters ordering toast.
character CLAIRE
parenthetical (leaning in the doorway)
dialogue The driver says carriage three's heating is stuck on summer.
character DEAN
dialogue That's nice for November.
character CLAIRE
dialogue Not when it's thirty-four degrees and the windows lock shut.
scene_heading INT. PLATFORM TWO - MOMENTS LATER
action PASSENGERS CLUSTER UNDER THE CANOPY. MRS. HALE (70s) HOLDS A STRING BAG AND POINTS HER UMBRELLA AT THE DEPARTURE SCREEN.
character MRS. HALE
dialogue That screen has promised me a train in two minutes for the last nine minutes.
character CLAIRE
dialogue It's an aspirational display, Mrs. Hale. We're bringing the carriages round now.
character BARRY
parenthetical (O.S., over tannoy)
dialogue Attention platform two. The nine-fourteen is feeling shy today. Please step back from the yellow line while we coax it out.
act_break END OF ACT ONE
act_break TAG
scene_heading INT. ANNOUNCER'S BOOTH - LATER
action THE PLATFORM IS FINALLY CLEAR. CLAIRE SETS A PLATE OF GINGER BISCUITS BY THE MICROPHONE.
character DEAN
dialogue Everybody made it on. Even the man with the double bass.
character BARRY
dialogue Especially the man with the double bass. He sits in carriage three so the varnish stays warm.
`;

export const PLATFORM_TWO_101_RUNTHROUGH_LINE =
  "Attention platform two. The nine-fourteen has decided to arrive fashionably late. Step back from the yellow line and keep your umbrellas folded.";

export const PLATFORM_TWO_102 = `
act_break TEASER
scene_heading INT. LOST PROPERTY OFFICE - AFTERNOON
action FLOOR-TO-CEILING SHELVES OF UMBRELLAS, SINGLE GLOVES, AND ONE CAREFULLY LABELLED BRASS TROMBONE.
action CLAIRE OPENS A LOGBOOK WHILE DEAN HOLDS UP A TIN LUNCHBOX SHAPED LIKE A TRAM.
character DEAN
dialogue Somebody left this on the eleven-oh-five. Still warm.
character CLAIRE
dialogue Do not open it, Dean. Rule one of lost property: if it's still warm, the owner is still on the concourse.
act_break ACT ONE
scene_heading INT. LANNICK CENTRAL CONCOURSE - CONTINUOUS
action BARRY SURVEYS THE CROWD THROUGH BINOCULARS FROM THE BOOTH WINDOW.
character BARRY
dialogue Spotted him. Beige coat, checking his pockets twice by the bookstall.
character CLAIRE
dialogue Announce the lunchbox without mentioning the cheese smell.
character BARRY
parenthetical (into microphone)
dialogue Would the gentleman missing a miniature tram please report to platform two before it departs under its own steam.
act_break END OF ACT ONE
`;

export const PLATFORM_TWO_103_OUTLINE = `
act_break TEASER
group Beat 1 — Rail replacement bus arrives at the taxi rank with a driver who has never been to Lannick.
act_break ACT ONE
group Beat 2 — Claire draws a turn-by-turn map on the back of a poster while Barry narrates the departure live.
group Beat 3 — Mrs. Hale takes the front seat and becomes the unofficial conductor for the whole route.
act_break TAG
group Beat 4 — The bus arrives four minutes early; nobody knows how to handle the silence.
`;

export const PLATFORM_TWO_EARLY_PITCH = `
scene_heading INT. SIGNAL BOX - NIGHT
action An early discarded pitch set in a disused signal box before the room moved the show down to the concourse on Platform Two.
character BARRY
dialogue Does anyone remember which lever opens the tea cupboard?
`;

export const PLATFORM_TWO_SEASONS: readonly SeasonEntry[] = Object.freeze([
  { id: "s1", number: 1, title: "Season 1" },
]);

export const PLATFORM_TWO_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "CLAIRE" },
  { kind: "character", name: "BARRY" },
  { kind: "character", name: "DEAN" },
  { kind: "character", name: "MRS. HALE" },
  { kind: "set", name: "Lannick Central Concourse" },
  { kind: "set", name: "Announcer's Booth" },
  { kind: "set", name: "Platform Two" },
]);

export const PLATFORM_TWO_STORYLINES: readonly SeedBoardStoryline[] =
  Object.freeze([
    { id: "sl-ops", title: "Station operations" },
    { id: "sl-dean", title: "Dean's first week" },
    { id: "sl-regulars", title: "Platform regulars" },
  ]);

export function platformTwoBoardCards(links: {
  ep101Scene1: string;
  ep101Scene2: string;
  ep102Scene1: string;
  ep103Beat2: string;
}): readonly SeedBoardCard[] {
  return [
    {
      id: "pt-c1",
      storylineId: "sl-ops",
      episodeId: "ep101",
      text: "The 09:14 arrives two carriages short and overheated.",
      linkBlockId: links.ep101Scene1,
    },
    {
      id: "pt-c2",
      storylineId: "sl-dean",
      episodeId: "ep101",
      text: "Dean learns green vs yellow tannoy switches in the booth.",
      linkBlockId: links.ep101Scene2,
    },
    {
      id: "pt-c3",
      storylineId: "sl-regulars",
      episodeId: "ep101",
      text: "Mrs. Hale challenges the aspirational departure screen.",
      linkBlockId: null,
    },
    {
      id: "pt-c4",
      storylineId: "sl-ops",
      episodeId: "ep102",
      text: "Warm tram-shaped lunchbox logged in Lost Property.",
      linkBlockId: links.ep102Scene1,
    },
    {
      id: "pt-c5",
      storylineId: "sl-regulars",
      episodeId: "ep103",
      text: "Mrs. Hale volunteers as conductor on the rail replacement bus.",
      linkBlockId: links.ep103Beat2,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tin Boat — Animation Series (`animation`, with Record draft + Pickup lines)
// ---------------------------------------------------------------------------

export const TIN_BOAT_101_RECORD = `
scene_heading EXT. PEBBLE COVE - MORNING
action BRIGHT PAPER-CUT SUNLIGHT OVER A STILL TIDAL POOL. PIP (a small painted tin boat with a crooked funnel) BOBS BESIDE A MOSSY BOLLARD.
action GULL (an oversized harbour gull wearing a knitted scarf) LANDS ON THE PIER RAIL AND PEERS DOWN.
character PIP
dialogue Morning, Gull! Tide's almost up to the third barnacle.
character GULL
parenthetical (puffing chest feathers)
dialogue Third barnacle means we're late for the breakwater race.
character PIP
dialogue I am not racing until I find my brass compass.
action PIP's tin lid clanks open, spilling two corks, a marble, and a folded paper star onto the jetty.
scene_heading EXT. ROCK POOL SHALLOWS - MOMENTS LATER
action CRYSTAL-CLEAR WATER. CRAB (wearing spectacles perched on his eyestalks) POLISHES A SHINY ROUND DISC HALF-BURIED IN SAND.
character CRAB
dialogue Finders keepers is a maritime tradition, Pip.
character PIP
dialogue That's not a coin, Crab! That's my compass, and the needle points to the bakery.
character GULL
dialogue Honestly, a compass that points to scones is far more useful than north.
character CRAB
parenthetical (handing it over with a click)
dialogue Fair enough. Keep your rudder clear of my rock garden next time.
scene_heading EXT. BREAKWATER CHANNEL - DAY
action PIP CHUGS OUT INTO SPARKLING WATER WITH THE COMPASS WEDGED PROUDLY BEHIND THE FUNNEL. GULL GLIDES OVERHEAD.
character PIP
dialogue Steady as she goes! Next stop, the lantern buoy!
`;

/** Post-Record script rewrites on 101 The Brass Compass so Export -> Pickup lines CSV produces 3 real pickup lines. */
export const TIN_BOAT_101_PICKUP_REWRITES: Readonly<Record<string, string>> =
  Object.freeze({
    "Third barnacle means we're late for the breakwater race.":
      "Third barnacle means the harbour bell rings in five minutes — we're late for the breakwater race!",
    "That's not a coin, Crab! That's my compass, and the needle points to the bakery.":
      "That's not a shiny coin, Crab! That's my brass compass, and it always points straight to the harbour bakery.",
    "Steady as she goes! Next stop, the lantern buoy!":
      "Full steam ahead! Next stop, the red lantern buoy!",
  });

export const TIN_BOAT_102 = `
scene_heading EXT. PEBBLE COVE - DUSK
action SOFT SILVER FOG ROLLS PAST THE HEADLAND. PIP'S LITTLE BOW LAMP CLICKS ON WITH A WARM AMBER GLOW.
character PIP
dialogue Anyone out there? The water looks like steamed milk!
character GULL
parenthetical (O.S., muffled)
dialogue Follow the honk, Pip! Keep two wing-lengths left of the buoy!
action GULL EMERGES FROM THE MIST HOLDING A TINY BRASS FOGHORN UNDER ONE WING.
character PIP
dialogue Where on earth did you get a foghorn?
character GULL
dialogue Borrowed it from the lighthouse cat. Just don't tell him I dropped it in the kelp.
`;

export const TIN_BOAT_LADDER = Object.freeze([
  "Outline",
  "Script",
  "Record",
  "Locked",
]);

export const TIN_BOAT_SEASONS: readonly SeasonEntry[] = Object.freeze([
  { id: "s1", number: 1, title: "Season 1" },
]);

export const TIN_BOAT_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "PIP" },
  { kind: "character", name: "GULL" },
  { kind: "character", name: "CRAB" },
  { kind: "set", name: "Pebble Cove" },
  { kind: "set", name: "Breakwater Channel" },
]);

export const TIN_BOAT_STORYLINES: readonly SeedBoardStoryline[] = Object.freeze(
  [
    { id: "tb-voyage", title: "Cove voyages" },
    { id: "tb-gull", title: "Gull's gadgets" },
  ],
);

export function tinBoatBoardCards(links: {
  ep101Scene1: string;
  ep102Scene1: string;
}): readonly SeedBoardCard[] {
  return [
    {
      id: "tb-c1",
      storylineId: "tb-voyage",
      episodeId: "tb101",
      text: "Pip recovers the brass compass from Crab's rock pool.",
      linkBlockId: links.ep101Scene1,
    },
    {
      id: "tb-c2",
      storylineId: "tb-gull",
      episodeId: "tb102",
      text: "Gull borrows the lighthouse cat's brass foghorn in the cove fog.",
      linkBlockId: links.ep102Scene1,
    },
  ];
}
