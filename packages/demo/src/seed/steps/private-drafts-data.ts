// Personal private drafts seeded across the five registered demo people, covering screenplay,
// manuscript, stage play, game script and audio formats.
import type { FormatId } from "@manent/schema";
import { seedDocId } from "@manent/sync-protocol";

export type PrivateProjectKind =
  "film" | "series" | "podcast" | "book" | "game" | "stage_play";

export interface PrivateDraftSpec {
  readonly userId: string;
  readonly slug: string;
  readonly projectTitle: string;
  readonly docTitle: string;
  readonly projectKind: PrivateProjectKind;
  readonly format: FormatId;
  readonly createdAt: string;
  readonly editedAt: string;
  readonly projectId: string;
  readonly docId: string;
  readonly text: string;
}

const draft = (spec: {
  readonly userId: string;
  readonly slug: string;
  readonly projectTitle: string;
  readonly docTitle: string;
  readonly projectKind: PrivateProjectKind;
  readonly format: FormatId;
  readonly createdAt: string;
  readonly editedAt: string;
  readonly text: string;
}): PrivateDraftSpec => ({
  ...spec,
  projectId: seedDocId(`private:${spec.userId}/${spec.slug}`),
  docId: seedDocId(`private-doc:${spec.userId}/${spec.slug}`),
});

export const PRIVATE_DRAFTS: readonly PrivateDraftSpec[] = Object.freeze([
  draft({
    userId: "dana",
    slug: "winter-timetable",
    projectTitle: "The Winter Timetable",
    docTitle: "The Winter Timetable",
    projectKind: "film",
    format: "screenplay",
    createdAt: "D−5 20:15",
    editedAt: "D−2 21:10",
    text: `
scene_heading EXT. PORT ALLARD STATION - NIGHT
action Sea fog hangs under the canopy lamps. One lit carriage waits at platform two while the timetable board clicks from 23:40 to BLANK.
action MARA KERR (40s), wool coat buttoned to the collar, checks her brass pocket watch against the station clock. Three minutes apart.
scene_heading INT. SLEEPER CARRIAGE - NIGHT
action Narrow corridor, varnished teak, rain ticking on the glass. A GUARD leans out of the brake van with a clipboard.
character GUARD
dialogue Nobody gets on after the ferry bell, love.
character MARA
parenthetical (showing a folded docket)
dialogue Then someone forgot to tell the harbourmaster.
action The guard reads the docket twice, his thumb resting over the harbour seal. Outside, the points clank over in the dark.
`,
  }),
  draft({
    userId: "dana",
    slug: "coastal-room-notes",
    projectTitle: "Notes for a Coastal Room",
    docTitle: "Notes for a Coastal Room",
    projectKind: "book",
    format: "manuscript",
    createdAt: "D−11 18:30",
    editedAt: "D−6 19:40",
    text: `
chapter Pacing a Six-Part Room
body Every episode of a coastal drama turns on the tide table before it turns on a confession. When a scene feels thin, put the ferry back on the clock and ask who misses the last crossing.
body Keep the opening two pages quiet. Let the audience hear a latch, a kettle boiling, or an engine idling on the quay before anyone explains why they are late.
chapter Keeping Scene Four Alive
body Never trim the pause after a character refuses a cup of tea. Half the subtext in the second act lives in what somebody sets down on the table instead of saying aloud.
`,
  }),
  draft({
    userId: "sam",
    slug: "two-stops-past-the-terminus",
    projectTitle: "Two Stops Past the Terminus",
    docTitle: "Two Stops Past the Terminus",
    projectKind: "stage_play",
    format: "stage_play",
    createdAt: "D−7 20:00",
    editedAt: "D−1 21:10",
    text: `
act_break ACT ONE
scene_heading Scene 1: The Waiting Room
action A small suburban platform shelter. Two green wooden benches, a radiator that ticks, and a vending machine humming out of tune. RAIN beats on the tin roof. NORA sits with a thermos. ELLIS enters shaking a folded umbrella.
character ELLIS
dialogue Tell me the 9:14 has not been and gone.
character NORA
parenthetical (without looking up)
dialogue It went past at nine-twelve. Nobody told the driver we still exist out here.
character ELLIS
dialogue I ran from the roundabout. My shoes are full of gravel.
character NORA
parenthetical (unscrewing the thermos cup)
dialogue Sit down. The next one stops because the driver lives on my road.
`,
  }),
  draft({
    userId: "sam",
    slug: "night-watchman",
    projectTitle: "Night Watchman",
    docTitle: "Night Watchman",
    projectKind: "game",
    format: "game",
    createdAt: "D−9 19:20",
    editedAt: "D−5 20:15",
    text: `
scene_heading EXT. GULL POINT BREAKWATER - NIGHT
engine WEATHER=FOG_HEAVY; LANTERN_FUEL=0.4
camera Wide low angle along the wet granite steps.
action The player reaches the fog-bell housing. Salt spray coats the brass striker.
character KEEPER
emote leans over the iron rail
dialogue That is three bells from the channel buoy, not two. Someone shifted the mooring chain.
general {lantern_lit}
character KEEPER
parenthetical (muttered)
dialogue Better log the bearing before the relief boat reads the wrong light.
`,
  }),
  draft({
    userId: "priya",
    slug: "pink-to-yellow",
    projectTitle: "Pink to Yellow: Revision Notes",
    docTitle: "Pink to Yellow: Revision Notes",
    projectKind: "book",
    format: "manuscript",
    createdAt: "D−8 17:10",
    editedAt: "D−3 18:20",
    text: `
chapter Before You Lock Pages
body Check every continuation heading and every dual-dialogue column before the first lock. Once scene numbers are fixed for the call sheet, an omitted scene keeps its number forever so the floor team never loses its bearings.
body Issue only the pages that changed, with the colour header dated to the morning of distribution. A clean packet saves the first assistant director twenty minutes on the van.
chapter Collating Late Notes
body When the room turns in two passes on the same afternoon, fold the director's trim into the active colour rather than burning a new paper stock before supper.
`,
  }),
  draft({
    userId: "priya",
    slug: "third-floor-east",
    projectTitle: "Third Floor, East",
    docTitle: "Third Floor, East",
    projectKind: "film",
    format: "screenplay",
    createdAt: "D−14 15:40",
    editedAt: "D−9 16:40",
    text: `
scene_heading INT. HOSPITAL RECORDS OFFICE - EVENING
action High shelves of buff folders under flickering strip lights. Outside the rain-streaked window, an ambulance reverses quietly into the bay.
action RINA (30s) balances a stack of discharge ledgers on her forearm and nudges a rolling ladder along the brass rail.
character RINA
dialogue Six boxes from nineteen ninety-four and not one index card in order.
action A porter appears at the frosted glass hatch, holding two paper cups of tea.
character PORTER
dialogue Night shift starts in ten. Left you the ginger biscuits by the stapler.
character RINA
parenthetical (smiling)
dialogue You are the only person in this building who reads the memo.
`,
  }),
  draft({
    userId: "leo",
    slug: "autumn-slate-notes",
    projectTitle: "Autumn Slate — Reader's Notes",
    docTitle: "Autumn Slate — Reader's Notes",
    projectKind: "book",
    format: "manuscript",
    createdAt: "D−6 16:20",
    editedAt: "D−2 17:45",
    text: `
chapter Harbour Lights — Series Two
body Episode 203 carries the clearest turn of the whole run. The quay confrontation lands because the harbour committee scene at the top of act two gives the inspector nowhere left to stand.
body Watch the transition into 206 The Bar: the outline promises three night exteriors in a row, so we should confirm tidal windows with production before greenlighting the final location day.
chapter The Lamp Room — Feature Pass
body The opening ten pages read briskly and hold the room. Ask the writer whether the clockmaker's ledger can appear one scene earlier so the final reveal pays off cleanly.
`,
  }),
  draft({
    userId: "ana",
    slug: "six-oclock-tide",
    projectTitle: "Six O'Clock Tide",
    docTitle: "Six O'Clock Tide",
    projectKind: "podcast",
    format: "variety",
    createdAt: "D−4 06:50",
    editedAt: "D−1 07:30",
    text: `
slug COLD OPEN — ARDLE QUAY
bracket [HARBOUR GULLS AND DIESEL IDLING T=0:08]
character ANA
dialogue Every morning before the six o'clock bulletin goes to air, four trawlers unload at the north slipway while the rest of Lannick is still asleep.
bracket [CRATES SLIDING ACROSS WET CONCRETE T=0:05]
character ANA
dialogue Today we walked down with a hand mic and a flask of black coffee to ask the harbour crew what a storm warning really looks like from the water.
slug PART ONE — THE SLIPWAY
character HARBOURMASTER
dialogue You read the barometer first, then you look at the rope lines. The forecast only confirms what the tide already told you.
`,
  }),
  draft({
    userId: "ana",
    slug: "the-harbour-wall",
    projectTitle: "The Harbour Wall",
    docTitle: "The Harbour Wall",
    projectKind: "film",
    format: "screenplay",
    createdAt: "D−12 18:10",
    editedAt: "D−7 19:10",
    text: `
scene_heading EXT. ARDLE SEA WALL - DAWN
action Low winter sun cuts across granite blocks slick with kelp. A stone mason, TOMAS (50s), taps a steel wedge into a weathered seam.
action His niece, CLARA (20s), sketches the tide marks in a pocket notebook, sheltering the pages from the wind with her sleeve.
character CLARA
dialogue Grandad marked the eighty-seven flood three courses lower than this.
character TOMAS
dialogue Aye. And the sea keeps climbing the steps to check our mortar.
action A ferry horn sounds far out beyond the breakwater. Tomas sets down his mallet and watches the wake curl cleanly round the pierhead.
`,
  }),
]);
