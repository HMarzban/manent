// Content for the Writers' room prose, stage play, and podcast showcase projects:
// The Salt Almanac (Book/Manuscript), Pier Four at Low Water (Stage Play), and The Harbour Tape (Podcast).
import type { SeedProjectName } from "../../seed/capabilities/series.ts";

// ---------------------------------------------------------------------------
// 1. The Salt Almanac — Book (Manuscript)
// ---------------------------------------------------------------------------

export const SALT_ALMANAC_FIRST_DRAFT = `
chapter 1. High Water at Gull Point
epigraph "The moon keeps an older ledger than the railway." — Ardle Quay Harbour Book, 1898
body Every harbour keeps two clocks: the brass one on the exchange roof that belongs to the railway, and the wet black line along the granite steps that belongs to the moon.
body Anyone who has waited on Ardle Quay with a cold flask knows which clock tells the truth. The timetables print neat quarter-hours, yet the wind off the north channel adds twelve minutes whenever it pleases.
break * * *
quote "Spring tide, 14 October: three inches above the iron ring at the lower steps; lamp oil carried up before dusk." — Gull Point Watch Book, 1911
body We began measuring the steps in late September with a folding rule, a pencil stub, and a tin of chalk borrowed from the boatyard.

chapter 2. The Bar and the Buoy
subheading The Outer Breakwater
body Beyond the outer breakwater the river forgets it ever ran between brick warehouses. Silt gathers in a long pale shelf that shifts after every equinoctial gale.
body The harbour pilots speak of the bar as though it were a sleeping dog that changes corners in the kitchen overnight. Cross it at half-flood with a slack helm and you hear nothing but hull water; cut the turn five yards early and the keel remembers.
break * * *
body Captain Mara Kerr kept a pocket notebook of every sounder reading between Wrenna Island and the outer bell. Her margins were fuller than the columns.

chapter 3. Lantern Glass and Paraffin
body Before the harbour board brought cable out along the causeway, the keeper carried four gallons of paraffin up seventy-two spiral steps twice a week.
quote "Never trim a wick in a hurry; a smoky chimney costs an hour of brass polish before breakfast." — Harbour Service Manual, 1928
body Even now the spare Fresnel panels sit under green baize in the store cupboard, catching morning light whenever someone opens the outer door.

chapter 4. Winter Crossings
body In January the ferries run for commuters, mail sacks, and the odd stubborn photographer who believes fog looks sharper from the stern deck.
body By the last crossing at twenty past ten the cabin smells of wet wool, engine oil, and strong tea poured from an enamel pot that has survived three skippers.
`;

export const SALT_ALMANAC_REVISED_OPENING =
  "Every harbour keeps two clocks: the municipal dial on Tolle Exchange roof that answers to the timetable, and the dark tide-line along the granite steps that answers only to the moon.";

export const SALT_ALMANAC_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "Captain Mara Kerr" },
  { kind: "set", name: "Gull Point" },
  { kind: "set", name: "Ardle Quay" },
  { kind: "term", name: "Spring tide" },
  { kind: "term", name: "Fresnel panels" },
]);

// ---------------------------------------------------------------------------
// 2. Pier Four at Low Water — Stage Play
// ---------------------------------------------------------------------------

export const PIER_FOUR_FRONT = `
general PIER FOUR AT LOW WATER
general A play in two acts
general by Sam Okafor & Dana Reyes

general CHARACTERS
general NORA (50s) — ticket clerk at the winter ferry booth, unhurried and exact.
general ELLIS (30s) — a surveyor carrying a brass tripod and damp notebooks.
general TOMAS (60s) — night watchman on Pier Four, who knows every plank by its creak.
general SETTING: The glassed-in waiting shelter at the end of Pier Four, Lannick Harbour. Late November.
`;

export const PIER_FOUR_REHEARSAL = `
act_break ACT ONE
scene_heading Scene 1: The Waiting Shelter
action *A narrow timber shelter overlooking dark water. Two slatted benches, a cast-iron stove humming softly, and a chalkboard timetable with half the times rubbed out. Rain taps steadily against the seaward panes. NORA sits behind the hatch counting brass tokens into neat tens. ELLIS enters, shaking out a heavy oilskin.*
character ELLIS
dialogue Tell me the nine-thirty to Wrenna is merely running late.
character NORA
parenthetical (without looking up from her tokens)
dialogue It is running tomorrow morning at seven-fifteen.
character ELLIS
dialogue The harbour office swore the wind was dropping.
character NORA
dialogue The harbour office sits behind triple glazing three streets inland. Sit by the stove before you drip onto my ledger.
action *ELLIS props his tripod against the bench. The outer door rattles and TOMAS steps inside with a hurricane lamp.*
character TOMAS
dialogue Chain's singing on the north bollard again. Means the swell's turned east.
character ELLIS
dialogue Then I am stranded on Pier Four with a half-finished sea-wall survey.
character NORA
parenthetical (sliding a tin mug under the hatch)
dialogue Worse places to be stranded. At least the kettle here boils before midnight.

scene_heading Scene 2: The Chalkboard
action *An hour later. The stove glows deeper amber. TOMAS studies ELLIS's damp drawing spread across the bench.*
character TOMAS
dialogue You've got the old sluice gate three yards too far south.
character ELLIS
dialogue I measured straight from the ordnance mark on the slipway.
character TOMAS
parenthetical (tapping the paper with a calloused thumb)
dialogue That stone moved two winters ago when the barge clipped the corner. Nobody told the mapmakers.
character NORA
dialogue They never ask the watchman. They wait for the wall to lean first.

act_break ACT TWO
scene_heading Scene 1: Slack Water
action *Past midnight. The rain has thinned to mist. Through the glass, the green harbour beacon sweeps once every six seconds.*
character ELLIS
dialogue If the old sluice sits under the timber decking, the whole repair estimate doubles.
character NORA
dialogue Or you patch the culvert properly once, and we stop bailing the cellar every March.
character TOMAS
parenthetical (lifting his lamp)
dialogue Come on, surveyor. Tide's off the lower steps for twenty minutes. Bring your tape and see it with your own eyes.
`;

export const PIER_FOUR_POLISHED_LINE =
  "It is running tomorrow morning at seven-fifteen, wind permitting and tea finished.";

export const PIER_FOUR_NAMES: readonly SeedProjectName[] = Object.freeze([
  { kind: "character", name: "NORA" },
  { kind: "character", name: "ELLIS" },
  { kind: "character", name: "TOMAS" },
  { kind: "set", name: "Pier Four Waiting Shelter" },
]);

// ---------------------------------------------------------------------------
// 3. The Harbour Tape — Podcast (`variety` + read-rate & bracket timing)
// ---------------------------------------------------------------------------

export const HARBOUR_TAPE_EP1 = `
slug COLD OPEN — THE NIGHT WATCH
bracket [TAPE: GULL POINT FOGHORN AND HARBOUR WATER T=0:14]
character ANA
dialogue Every Thursday at midnight, when the last commuter ferry ties up at Ardle Quay, the radio room above the fish hall switches to the quiet frequency.
bracket [MUSIC: HARBOUR TAPE THEME FADES UNDER T=0:10]
character ANA
dialogue From Writers' room Audio, this is The Harbour Tape — stories recorded on the water after the city goes indoors. I'm Ana Costa.

slug PART ONE — THE WATCH LOG
bracket [TAPE: HEAVY LEATHER LEDGER OPENING ON WOOD T=0:06]
character WATCHMAN
dialogue People think nothing happens between midnight and four. That's only because nobody's standing on the slipway to hear the cables settle.
character ANA
dialogue In nineteen seventy-four, harbour watchmen kept every weather note in pencil because fountain ink froze on the outer pier.
bracket [TAPE: WIND ACROSS RIGGING, FADING OUT T=0:18]
character WATCHMAN
dialogue You read the tide first, then the barometer, then the kettle. If the kettle takes ten minutes, there's a gale coming up the channel.

slug CREDITS
bracket [MUSIC: CLOSING THEME TO FULL T=0:15]
character ANA
dialogue The Harbour Tape is produced by Ana Costa and mixed in Lannick. Next week: the bells along the outer bar.
`;

export const HARBOUR_TAPE_EP1_PRODUCER_NOTE =
  "Producer note (excluded from air timing): confirm sound-clearance for the 1974 archive foghorn tape before upload.";

export const HARBOUR_TAPE_EP2 = `
slug COLD OPEN — BELL BUOY FOUR
bracket [TAPE: DISTANT BRASS BELL ON CHANNEL SWELL T=0:11]
character ANA
dialogue Out past Gull Point, four bronze clappers strike whenever the channel swell lifts more than two feet.
bracket [MUSIC: HARBOUR TAPE THEME T=0:09]
character ANA
dialogue Sailors can tell which buoy they are passing in thick fog purely by the pitch of the iron ring.

slug PART ONE — TUNING THE BAR
bracket [TAPE: BOATYARD HAMMER ON BRONZE T=0:8]
character FOUNDRYMAN
dialogue Salt water changes the note every ten years. We haul the bell ashore, scrape the barnacles clean, and strike it once with a wooden mallet before it goes back out.
character ANA
dialogue That single strike carries half a mile across the mudflats on a still morning.
`;
