// The studio slate: each film's outline, cast and places, and one bank of lines they all share, filled with each film's own people.
import type { FormatId } from "@manent/schema";
import type { Beat, LineIntent, StyleGuide } from "../../guide.ts";

/** `called` is how a line names the person. */
interface Member {
  cue: string;
  name: string;
  called: string;
}

/** `spoken` is how a line names the place. */
interface Place {
  heading: string;
  spoken: string;
}

interface Film {
  /** The document key its beats are numbered under. */
  key: string;
  project: string;
  format: FormatId;
  cast: readonly Member[];
  places: readonly Place[];
  names: readonly string[];
  beats: readonly Omit<Beat, "id">[];
}

/** `speaker` 0 is the line's `{cast:0}`; null is any of the beat's cast, so such a line names only a place. */
interface SharedLine {
  speaker: 0 | null;
  intent: LineIntent;
  text: string;
}

const STYLE = Object.freeze({
  actionWords: 25,
  dialogueWords: 30,
  sentenceWords: 25,
  banned: [],
});

const FILMS: readonly Film[] = [
  {
    key: "heavy/h02/script",
    project: "ned-ashby-and-the-glass-orchard",
    format: "screenplay",
    cast: [
      { cue: "NED", name: "Ned Ashby", called: "Ned" },
      { cue: "HATTIE", name: "Hattie Price", called: "Hattie" },
      {
        cue: "MAGISTER VELLE",
        name: "Magister Cora Velle",
        called: "Magister Velle",
      },
      {
        cue: "ALDERMAN CRANE",
        name: "Alderman Silas Crane",
        called: "Alderman Crane",
      },
      { cue: "MAUD", name: "Maud Ashby", called: "Maud" },
    ],
    places: [
      {
        heading: "EXT. FOURTH WARD - WASTE GROUND",
        spoken: "the waste ground",
      },
      { heading: "EXT. GLASS ORCHARD", spoken: "the glass orchard" },
      { heading: "INT. GUILD HALL", spoken: "the Guild Hall" },
      { heading: "INT. GLASSWORKS - FURNACE ROOM", spoken: "the furnace room" },
      { heading: "INT. ASHBY HOUSE - KITCHEN", spoken: "the back kitchen" },
    ],
    names: ["Lantern"],
    beats: [
      {
        scenes: [1, 6],
        pages: [1, 11],
        timeOfDay: "NIGHT",
        places: ["EXT. FOURTH WARD - WASTE GROUND", "EXT. GLASS ORCHARD"],
        cast: ["NED", "MAUD"],
        summary:
          "Walking Maud's round through the Fourth Ward, Ned sees an afterglow over the waste ground and finds trees of glass growing there in the dark.",
      },
      {
        scenes: [7, 12],
        pages: [11, 21],
        timeOfDay: "DAY",
        places: ["INT. GLASSWORKS - FURNACE ROOM"],
        cast: ["NED", "HATTIE"],
        summary:
          "Ned brings a glass leaf to Hattie at the furnace; it melts at her lowest heat and sets again by itself, which glass has never done.",
      },
      {
        scenes: [13, 18],
        pages: [21, 32],
        timeOfDay: "NIGHT",
        places: ["INT. GUILD HALL"],
        cast: ["MAGISTER VELLE", "ALDERMAN CRANE", "NED"],
        summary:
          "Magister Velle hears Alderman Crane's plan to clear the waste ground for gas mains, and the Guild votes to cut the orchard down before it spreads.",
      },
      {
        scenes: [19, 24],
        pages: [32, 42],
        timeOfDay: "NIGHT",
        places: ["EXT. GLASS ORCHARD"],
        cast: ["NED", "HATTIE"],
        summary:
          "Ned and Hattie watch the orchard grow: each tree rings a note as it lengthens, and the notes keep the hours better than the Lantern does.",
      },
      {
        scenes: [25, 30],
        pages: [42, 53],
        timeOfDay: "DAWN",
        places: ["INT. ASHBY HOUSE - KITCHEN", "INT. GUILD HALL"],
        cast: ["MAUD", "MAGISTER VELLE", "NED"],
        summary:
          "Maud refuses to carry the Guild's axe; Velle admits the Lantern was first lit from the orchard, and that cutting it was the Guild's oldest mistake.",
      },
      {
        scenes: [31, 34],
        pages: [53, 61],
        timeOfDay: "NIGHT",
        places: ["EXT. GLASS ORCHARD"],
        cast: ["NED", "HATTIE", "ALDERMAN CRANE", "MAUD"],
        summary:
          "Crane's men arrive with saws; Ned lights the orchard from within, and the whole Fourth Ward sees its streets by glass-light and will not let it go.",
      },
    ],
  },
  {
    key: "heavy/h04/script",
    project: "ember-fleet-the-far-shore",
    format: "screenplay",
    cast: [
      { cue: "ILSE", name: "Ilse Varo", called: "Ilse" },
      { cue: "TEMBA", name: "Temba Kosi", called: "Temba" },
      { cue: "ROWE", name: "Hesper Rowe", called: "Rowe" },
      { cue: "THANE", name: "Osric Thane", called: "Thane" },
      { cue: "NIKO", name: "Niko Varo", called: "Niko" },
      { cue: "AUD", name: "Aud Selwyn", called: "Aud" },
    ],
    places: [
      { heading: "INT. LONG PATIENCE - TUG CABIN", spoken: "the tug cabin" },
      { heading: "INT. ARDENT - CHART ROOM", spoken: "the chart room" },
      { heading: "EXT. HOLLOW - CONVOY LINE", spoken: "the convoy line" },
      { heading: "INT. SLOW MERCY - EMPTY HOLD", spoken: "the empty hold" },
    ],
    names: ["Vael", "Turnback"],
    beats: [
      {
        scenes: [1, 10],
        pages: [1, 19],
        timeOfDay: "DAY",
        places: ["INT. ARDENT - CHART ROOM", "EXT. HOLLOW - CONVOY LINE"],
        cast: ["ILSE", "ROWE"],
        summary:
          "Halfway across the Hollow, Ilse finds a second course drawn on her stolen chart in a hand older than hers, and Rowe orders the convoy to hold its line.",
      },
      {
        scenes: [11, 22],
        pages: [19, 40],
        timeOfDay: "NIGHT",
        places: ["INT. LONG PATIENCE - TUG CABIN"],
        cast: ["TEMBA", "ILSE"],
        summary:
          "Temba takes the Long Patience out to a dark hull lying across their course; its markings were painted before Vael's sun began to fail.",
      },
      {
        scenes: [23, 34],
        pages: [40, 61],
        timeOfDay: "DAY",
        places: ["INT. SLOW MERCY - EMPTY HOLD"],
        cast: ["TEMBA", "ILSE", "AUD"],
        summary:
          "The Slow Mercy left a century ahead of them and never arrived; in its last lit room Aud has kept the ship's count for forty years.",
      },
      {
        scenes: [35, 46],
        pages: [61, 82],
        timeOfDay: "NIGHT",
        places: ["INT. ARDENT - CHART ROOM"],
        cast: ["THANE", "ROWE", "ILSE"],
        summary:
          "Thane reads the old ship as proof that the far shore cannot be reached and asks the Turnback ships to vote; Rowe has to let him speak.",
      },
      {
        scenes: [47, 56],
        pages: [82, 101],
        timeOfDay: "DAY",
        places: ["EXT. HOLLOW - CONVOY LINE", "INT. LONG PATIENCE - TUG CABIN"],
        cast: ["NIKO", "ILSE", "TEMBA"],
        summary:
          "Niko crosses to the Long Patience on a supply run and stays; he and Ilse work through the old ship's logs together without saying why.",
      },
      {
        scenes: [57, 64],
        pages: [101, 118],
        timeOfDay: "DAWN",
        places: ["INT. SLOW MERCY - EMPTY HOLD", "INT. ARDENT - CHART ROOM"],
        cast: ["ILSE", "AUD", "ROWE", "THANE"],
        summary:
          "The logs show where the Slow Mercy turned too soon; Aud chooses to come with them, and the vote goes to going on, by a single ship.",
      },
    ],
  },
  {
    key: "heavy/h06/script",
    project: "the-keeper-of-the-last-bell-the-founding-road",
    format: "screenplay",
    cast: [
      { cue: "TAMSIN", name: "Tamsin Hale", called: "Tamsin" },
      { cue: "JOSS", name: "Joss", called: "Joss" },
      { cue: "DAME WENNA", name: "Dame Wenna Coyle", called: "Dame Wenna" },
      { cue: "EDRIC", name: "Edric Fay", called: "Edric" },
      { cue: "HOB", name: "Hob Merritt", called: "Hob" },
    ],
    places: [
      {
        heading: "EXT. GREY REACH - FORK IN THE ROAD",
        spoken: "the fork in the road",
      },
      { heading: "INT. TOLL HOUSE", spoken: "the toll house" },
      { heading: "EXT. HIGH PATH - GOAT SHELTER", spoken: "the goat shelter" },
      { heading: "EXT. RIVER MERRIN - FORD", spoken: "the ford" },
      { heading: "EXT. RUINED BELL TOWER", spoken: "the ruined bell tower" },
    ],
    names: ["Carrow Height", "Hush"],
    beats: [
      {
        scenes: [1, 12],
        pages: [1, 22],
        timeOfDay: "DAY",
        places: ["EXT. GREY REACH - FORK IN THE ROAD", "INT. TOLL HOUSE"],
        cast: ["TAMSIN", "DAME WENNA", "EDRIC", "JOSS", "HOB"],
        summary:
          "At the Grey Reach the road forks under the mists, and Hob, the last toll-keeper, says only one way still has a bell that rings.",
      },
      {
        scenes: [13, 24],
        pages: [22, 44],
        timeOfDay: "NIGHT",
        places: ["INT. TOLL HOUSE"],
        cast: ["DAME WENNA", "EDRIC", "TAMSIN"],
        summary:
          "Dame Wenna's knee will not take the high road and Edric's maps do not show it; the company argues until the fire goes out.",
      },
      {
        scenes: [25, 36],
        pages: [44, 66],
        timeOfDay: "DAWN",
        places: ["EXT. GREY REACH - FORK IN THE ROAD"],
        cast: ["TAMSIN", "JOSS", "DAME WENNA", "EDRIC"],
        summary:
          "The company splits: Wenna and Edric take the low road to warn the valleys, and Tamsin goes on alone with Joss and the bell-tongue.",
      },
      {
        scenes: [37, 48],
        pages: [66, 88],
        timeOfDay: "DAY",
        places: ["EXT. HIGH PATH - GOAT SHELTER"],
        cast: ["JOSS", "TAMSIN"],
        summary:
          "Joss leads her over paths only goats use; they shelter from the Hush in a hut where the bell rope has been cut, not worn.",
      },
      {
        scenes: [49, 60],
        pages: [88, 110],
        timeOfDay: "NIGHT",
        places: ["EXT. RIVER MERRIN - FORD"],
        cast: ["TAMSIN", "JOSS", "HOB"],
        summary:
          "At the Merrin ford the water is too high, and Hob, who has followed them, carries the tongue across on his back without being asked.",
      },
      {
        scenes: [61, 70],
        pages: [110, 129],
        timeOfDay: "DUSK",
        places: ["EXT. RUINED BELL TOWER"],
        cast: ["TAMSIN", "JOSS"],
        summary:
          "Tamsin rings a cracked bell in a ruined tower with the tongue held in her hands; for one peal the road ahead clears as far as Carrow Height.",
      },
    ],
  },
  {
    key: "heavy/h07/script",
    project: "the-keeper-of-the-last-bell-carrow-height",
    format: "screenplay",
    cast: [
      {
        cue: "PROVOST VANE",
        name: "Provost Ysolde Vane",
        called: "Provost Vane",
      },
      { cue: "BROTHER ANSEL", name: "Brother Ansel", called: "Brother Ansel" },
      {
        cue: "MASTER ELLICK",
        name: "Master Bran Ellick",
        called: "Master Ellick",
      },
      { cue: "PERRIN", name: "Perrin Gale", called: "Perrin" },
      { cue: "LETTICE", name: "Lettice Orme", called: "Lettice" },
    ],
    places: [
      { heading: "EXT. CARROW HEIGHT - GATE", spoken: "the Carrow gate" },
      {
        heading: "INT. PROVOST'S HOUSE - STUDY",
        spoken: "the study",
      },
      { heading: "INT. FOUNDING - CASTING FLOOR", spoken: "the casting floor" },
      { heading: "INT. BELL CHAMBER", spoken: "the bell chamber" },
      { heading: "EXT. FOUNDING PIT", spoken: "the founding pit" },
    ],
    names: ["Tamsin Hale", "Joss"],
    beats: [
      {
        scenes: [1, 12],
        pages: [1, 21],
        timeOfDay: "DUSK",
        places: ["EXT. CARROW HEIGHT - GATE"],
        cast: ["PERRIN", "LETTICE"],
        summary:
          "Tamsin Hale and Joss reach the Carrow gate with the bell-tongue; Perrin, the youngest ringer, lets them in against the Provost's standing order.",
      },
      {
        scenes: [13, 24],
        pages: [21, 42],
        timeOfDay: "NIGHT",
        places: ["INT. PROVOST'S HOUSE - STUDY"],
        cast: ["PROVOST VANE", "LETTICE"],
        summary:
          "Provost Vane welcomes them warmly and has the tongue locked away; Lettice copies out the order that the Founding is closed until further notice.",
      },
      {
        scenes: [25, 36],
        pages: [42, 63],
        timeOfDay: "DAY",
        places: ["INT. FOUNDING - CASTING FLOOR"],
        cast: ["MASTER ELLICK", "PERRIN"],
        summary:
          "Master Ellick has never cast a bell, nor has anyone in the Founding's records for a hundred years, and he cannot say what one should sound like.",
      },
      {
        scenes: [37, 48],
        pages: [63, 84],
        timeOfDay: "NIGHT",
        places: ["INT. BELL CHAMBER"],
        cast: ["BROTHER ANSEL", "PERRIN"],
        summary:
          "Brother Ansel arrives with the cracked tongue of his own valley's bell, and the two tongues struck together give the note the records lost.",
      },
      {
        scenes: [49, 60],
        pages: [84, 105],
        timeOfDay: "DAY",
        places: ["EXT. FOUNDING PIT", "INT. PROVOST'S HOUSE - STUDY"],
        cast: ["PROVOST VANE", "MASTER ELLICK", "LETTICE"],
        summary:
          "Lettice tells Master Ellick where the tongue is kept; Vane offers to let them cast one bell if every other valley is left silent.",
      },
      {
        scenes: [61, 68],
        pages: [105, 126],
        timeOfDay: "DAWN",
        places: ["EXT. FOUNDING PIT", "INT. BELL CHAMBER"],
        cast: ["MASTER ELLICK", "BROTHER ANSEL", "PROVOST VANE", "PERRIN"],
        summary:
          "They cast the first bell anyway; it sounds like nothing anyone expected, and the mists lift from the road below.",
      },
    ],
  },
  {
    key: "heavy/h08/script",
    project: "paper-moons",
    format: "animation",
    cast: [
      { cue: "PIA", name: "Pia Lorrimer", called: "Pia" },
      { cue: "ABEL", name: "Abel Lorrimer", called: "Abel" },
      {
        cue: "MAYOR ASHDOWN",
        name: "Mayor Prue Ashdown",
        called: "Mayor Ashdown",
      },
      { cue: "QUILL", name: "Quill", called: "Quill" },
      { cue: "TEO", name: "Teo Marchant", called: "Teo" },
    ],
    places: [
      {
        heading: "INT. LORRIMER STATIONERY - BACK ROOM",
        spoken: "the stationer's back room",
      },
      { heading: "EXT. CITY ROOFTOPS", spoken: "the rooftops" },
      { heading: "INT. TOWN HALL", spoken: "the town hall" },
      { heading: "EXT. CLOCK SQUARE", spoken: "Clock Square" },
      { heading: "EXT. TALLEST CHIMNEY", spoken: "the tallest chimney" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 7],
        pages: [1, 14],
        timeOfDay: "NIGHT",
        places: ["EXT. CLOCK SQUARE", "INT. LORRIMER STATIONERY - BACK ROOM"],
        cast: ["PIA", "ABEL", "QUILL"],
        summary:
          "The city has had no moon for a year; Pia folds a paper crane in Abel's shop window, and the crane, Quill, unfolds itself and speaks.",
      },
      {
        scenes: [8, 15],
        pages: [14, 28],
        timeOfDay: "DAY",
        places: ["INT. LORRIMER STATIONERY - BACK ROOM"],
        cast: ["PIA", "QUILL", "ABEL"],
        summary:
          "Quill tells Pia the moon left because nobody looked up any more; Abel gives her his last ream of the good white paper.",
      },
      {
        scenes: [16, 22],
        pages: [28, 42],
        timeOfDay: "NIGHT",
        places: ["INT. TOWN HALL"],
        cast: ["MAYOR ASHDOWN", "TEO"],
        summary:
          "Mayor Ashdown offers a prize for a new moon, and Teo enters a moon of tin and electric bulbs that blows every fuse in the square.",
      },
      {
        scenes: [23, 30],
        pages: [42, 57],
        timeOfDay: "NIGHT",
        places: ["EXT. CITY ROOFTOPS"],
        cast: ["PIA", "QUILL", "TEO"],
        summary:
          "Pia's first paper moon is too heavy to rise; Teo, sulking on the roofs, shows her how to fold it lighter, with air inside every crease.",
      },
      {
        scenes: [31, 37],
        pages: [57, 71],
        timeOfDay: "DAWN",
        places: ["EXT. TALLEST CHIMNEY"],
        cast: ["PIA", "TEO", "QUILL"],
        summary:
          "Rain undoes the second moon on the tallest chimney; Quill gives up his own folds to patch it and becomes a flat square of paper.",
      },
      {
        scenes: [38, 44],
        pages: [71, 84],
        timeOfDay: "NIGHT",
        places: ["EXT. CLOCK SQUARE"],
        cast: ["PIA", "ABEL", "MAYOR ASHDOWN", "TEO"],
        summary:
          "The whole city folds a moon together in Clock Square; it rises, and the old moon comes back to look at it, with Quill folded in its light.",
      },
    ],
  },
  {
    key: "heavy/h09/script",
    project: "salt-and-sons",
    format: "screenplay",
    cast: [
      { cue: "KIT", name: "Kit Haskett", called: "Kit" },
      { cue: "BARNABY", name: "Barnaby Haskett", called: "Barnaby" },
      { cue: "LEW", name: "Lew Haskett", called: "Lew" },
      { cue: "NAN", name: "Nan Odgers", called: "Nan" },
      { cue: "IVOR", name: "Ivor Sallis", called: "Ivor" },
    ],
    places: [
      {
        heading: "INT. HASKETT HOUSE - FRONT ROOM",
        spoken: "the brothers' front room",
      },
      { heading: "EXT. SALT PANS", spoken: "the salt pans" },
      {
        heading: "INT. SALT WORKS - BOILING HOUSE",
        spoken: "the boiling house",
      },
      { heading: "INT. MAGPIE - WHEELHOUSE", spoken: "the wheelhouse" },
      { heading: "EXT. HARBOUR STEPS", spoken: "the harbour steps" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 18],
        timeOfDay: "DAY",
        places: ["INT. HASKETT HOUSE - FRONT ROOM"],
        cast: ["KIT", "BARNABY", "LEW", "NAN"],
        summary:
          "After the funeral the will is read in the front room: the salt works, its debts and the boat Magpie go to the three brothers together.",
      },
      {
        scenes: [10, 19],
        pages: [18, 36],
        timeOfDay: "DAY",
        places: ["EXT. SALT PANS", "INT. SALT WORKS - BOILING HOUSE"],
        cast: ["NAN", "KIT"],
        summary:
          "Nan shows Kit the pans their father let silt up, and the boiling house fire that was kept in for ninety years and went out the night he died.",
      },
      {
        scenes: [20, 28],
        pages: [36, 53],
        timeOfDay: "NIGHT",
        places: ["INT. MAGPIE - WHEELHOUSE"],
        cast: ["BARNABY", "LEW"],
        summary:
          "Barnaby wants to sell the works and keep the boat; Lew wants to sell the boat and keep the works; neither of them can sail her.",
      },
      {
        scenes: [29, 38],
        pages: [53, 71],
        timeOfDay: "DAY",
        places: ["EXT. HARBOUR STEPS"],
        cast: ["IVOR", "KIT", "BARNABY"],
        summary:
          "Ivor Sallis offers to buy everything for the price of the debts, and Barnaby nearly signs on the harbour steps.",
      },
      {
        scenes: [39, 48],
        pages: [71, 88],
        timeOfDay: "NIGHT",
        places: ["INT. SALT WORKS - BOILING HOUSE"],
        cast: ["KIT", "LEW", "NAN"],
        summary:
          "Kit and Lew relight the boiling house fire with the boat's last fuel, and Nan teaches them to rake the pans by the sound.",
      },
      {
        scenes: [49, 56],
        pages: [88, 104],
        timeOfDay: "DAWN",
        places: ["EXT. SALT PANS", "INT. MAGPIE - WHEELHOUSE"],
        cast: ["KIT", "BARNABY", "LEW", "NAN"],
        summary:
          "The first salt in a year comes off the pans; the brothers take it to market in Magpie, badly, together, and sell all of it.",
      },
    ],
  },
  {
    key: "heavy/h10/script",
    project: "overtime-at-the-observatory",
    format: "screenplay",
    cast: [
      { cue: "MARIT", name: "Marit Hollen", called: "Marit" },
      { cue: "FERGUS", name: "Fergus Lyle", called: "Fergus" },
      { cue: "DOLORES", name: "Dolores Wynn", called: "Dolores" },
      {
        cue: "PROFESSOR TILLY",
        name: "Professor Ambrose Tilly",
        called: "Professor Tilly",
      },
      { cue: "JUNO", name: "Juno Akers", called: "Juno" },
    ],
    places: [
      { heading: "INT. OBSERVATORY - DOME", spoken: "the dome" },
      {
        heading: "INT. OBSERVATORY - CONTROL ROOM",
        spoken: "the control room",
      },
      {
        heading: "INT. OBSERVATORY - TEA ROOM",
        spoken: "the observers' tea room",
      },
      { heading: "EXT. OBSERVATORY - CAR PARK", spoken: "the car park" },
      {
        heading: "INT. UNIVERSITY - TILLY'S OFFICE",
        spoken: "the professor's office",
      },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "NIGHT",
        places: ["INT. OBSERVATORY - DOME", "INT. OBSERVATORY - CONTROL ROOM"],
        cast: ["MARIT", "FERGUS", "DOLORES"],
        summary:
          "The rota puts Marit and Fergus on the same night shift for the whole observing run, and each tells Dolores the other will not last a week.",
      },
      {
        scenes: [10, 19],
        pages: [17, 34],
        timeOfDay: "NIGHT",
        places: ["INT. OBSERVATORY - CONTROL ROOM"],
        cast: ["MARIT", "FERGUS"],
        summary:
          "They divide the telescope by the hour and the desk by a line of tape; Fergus steals two minutes of her time and finds something in them.",
      },
      {
        scenes: [20, 28],
        pages: [34, 50],
        timeOfDay: "DAY",
        places: ["INT. UNIVERSITY - TILLY'S OFFICE"],
        cast: ["PROFESSOR TILLY", "MARIT", "FERGUS"],
        summary:
          "Professor Tilly will fund one paper, not two: whoever confirms the faint new object first keeps the post.",
      },
      {
        scenes: [29, 38],
        pages: [50, 67],
        timeOfDay: "NIGHT",
        places: ["INT. OBSERVATORY - DOME", "INT. OBSERVATORY - TEA ROOM"],
        cast: ["MARIT", "FERGUS", "JUNO"],
        summary:
          "Cloud for eleven nights; they play cards in the tea room with Juno, the student, and find they have the same bad jokes.",
      },
      {
        scenes: [39, 47],
        pages: [67, 82],
        timeOfDay: "NIGHT",
        places: ["EXT. OBSERVATORY - CAR PARK", "INT. OBSERVATORY - DOME"],
        cast: ["FERGUS", "DOLORES", "MARIT"],
        summary:
          "Fergus's car will not start, and Dolores locks them both in the dome by mistake on the one clear night left.",
      },
      {
        scenes: [48, 54],
        pages: [82, 96],
        timeOfDay: "DAWN",
        places: ["INT. OBSERVATORY - CONTROL ROOM"],
        cast: ["MARIT", "FERGUS", "PROFESSOR TILLY"],
        summary:
          "They confirm the object together and put both names on the paper; Tilly sighs, and the next rota has them on nights again.",
      },
    ],
  },
  {
    key: "heavy/h11/script",
    project: "quiet-water",
    format: "screenplay",
    cast: [
      { cue: "NESSA", name: "Nessa Gourlay", called: "Nessa" },
      { cue: "DOM", name: "Dom Petrie", called: "Dom" },
      {
        cue: "INSPECTOR CREWE",
        name: "Inspector Mattie Crewe",
        called: "Inspector Crewe",
      },
      { cue: "SEB", name: "Seb Garrow", called: "Seb" },
      { cue: "EDITH", name: "Edith Pardoe", called: "Edith" },
    ],
    places: [
      { heading: "EXT. RESERVOIR - JETTY", spoken: "the jetty" },
      { heading: "EXT. RESERVOIR - UNDERWATER", spoken: "the deep water" },
      { heading: "INT. DIVE VAN", spoken: "the dive van" },
      { heading: "INT. KEEPER'S COTTAGE", spoken: "the keeper's cottage" },
      {
        heading: "INT. POLICE STATION - FRONT OFFICE",
        spoken: "the front office",
      },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "DAY",
        places: ["EXT. RESERVOIR - JETTY", "EXT. RESERVOIR - UNDERWATER"],
        cast: ["NESSA", "DOM", "INSPECTOR CREWE"],
        summary:
          "Nessa goes down to hook a stolen car for Inspector Crewe and, under it, touches the roof of another car that has been there much longer.",
      },
      {
        scenes: [10, 20],
        pages: [17, 35],
        timeOfDay: "DAY",
        places: ["INT. DIVE VAN"],
        cast: ["NESSA", "DOM"],
        summary:
          "Dom wants to log it and go home; Nessa has already read the old plate off her camera, and it belongs to no car still on any list.",
      },
      {
        scenes: [21, 30],
        pages: [35, 52],
        timeOfDay: "NIGHT",
        places: ["INT. KEEPER'S COTTAGE"],
        cast: ["SEB", "NESSA"],
        summary:
          "Seb, the reservoir keeper, remembers the valley before it was flooded, and the lane that ran where the old car lies.",
      },
      {
        scenes: [31, 40],
        pages: [52, 69],
        timeOfDay: "DAY",
        places: ["INT. POLICE STATION - FRONT OFFICE"],
        cast: ["INSPECTOR CREWE", "EDITH", "NESSA"],
        summary:
          "Edith Pardoe has asked about her brother's car every year for forty years; Crewe has the file, and it is empty.",
      },
      {
        scenes: [41, 50],
        pages: [69, 86],
        timeOfDay: "DAWN",
        places: ["EXT. RESERVOIR - UNDERWATER"],
        cast: ["NESSA", "DOM"],
        summary:
          "Against orders Nessa and Dom dive at first light; the old car's door opens, and inside is only a suitcase, packed for a journey.",
      },
      {
        scenes: [51, 58],
        pages: [86, 102],
        timeOfDay: "DAY",
        places: ["EXT. RESERVOIR - JETTY"],
        cast: ["NESSA", "EDITH", "SEB", "INSPECTOR CREWE"],
        summary:
          "The suitcase holds two tickets and a letter; Edith reads her brother's letter on the jetty while the car comes up behind her.",
      },
    ],
  },
  {
    key: "heavy/h12/script",
    project: "sixteen-bridges",
    format: "screenplay",
    cast: [
      { cue: "WALTER", name: "Walter Brisco", called: "Walter" },
      { cue: "PHILIPPA", name: "Philippa Rudd", called: "Philippa" },
      { cue: "DESMOND", name: "Desmond Okoro", called: "Desmond" },
      { cue: "ALF", name: "Alf Penhale", called: "Alf" },
      { cue: "KEZIA", name: "Kezia Mold", called: "Kezia" },
      { cue: "LIONEL", name: "Lionel Sparrow", called: "Lionel" },
    ],
    places: [
      { heading: "INT. ALLOTMENT SHED", spoken: "the allotment shed" },
      { heading: "INT. WALTER'S GARAGE", spoken: "the garage" },
      { heading: "INT. BRIDGE OFFICE", spoken: "the bridge office" },
      { heading: "EXT. RIVERSIDE - TOWPATH", spoken: "the towpath" },
      { heading: "EXT. IRON BRIDGE", spoken: "the iron bridge" },
    ],
    names: ["Lannick"],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 18],
        timeOfDay: "DAY",
        places: ["INT. ALLOTMENT SHED"],
        cast: ["WALTER", "PHILIPPA", "DESMOND", "ALF"],
        summary:
          "Walter shows his old firm's friends a plan drawn on seed packets: by dawn every one of Lannick's sixteen bridges will be wearing a scarf.",
      },
      {
        scenes: [10, 20],
        pages: [18, 37],
        timeOfDay: "NIGHT",
        places: ["INT. WALTER'S GARAGE"],
        cast: ["PHILIPPA", "LIONEL", "ALF"],
        summary:
          "Philippa does the loads, Alf the knots, and Lionel, who built half the bridges, says the sixteenth one cannot be reached from anywhere.",
      },
      {
        scenes: [21, 31],
        pages: [37, 55],
        timeOfDay: "DAY",
        places: ["INT. BRIDGE OFFICE"],
        cast: ["KEZIA", "DESMOND"],
        summary:
          "Desmond visits the bridge office for drawings and meets Kezia, the young inspector, who has already noticed the chalk marks.",
      },
      {
        scenes: [32, 42],
        pages: [55, 74],
        timeOfDay: "NIGHT",
        places: ["EXT. RIVERSIDE - TOWPATH", "EXT. IRON BRIDGE"],
        cast: ["WALTER", "ALF", "DESMOND"],
        summary:
          "A rehearsal on the iron bridge goes wrong in every way that can be laughed at, and one way that cannot: Walter forgets where he is.",
      },
      {
        scenes: [43, 52],
        pages: [74, 92],
        timeOfDay: "DAY",
        places: ["INT. WALTER'S GARAGE"],
        cast: ["PHILIPPA", "WALTER", "KEZIA"],
        summary:
          "Philippa wants to call it off; Kezia turns up with the key to the sixteenth bridge and an offer to hold the ladder.",
      },
      {
        scenes: [53, 60],
        pages: [92, 110],
        timeOfDay: "DAWN",
        places: ["EXT. IRON BRIDGE", "EXT. RIVERSIDE - TOWPATH"],
        cast: ["WALTER", "PHILIPPA", "DESMOND", "ALF", "LIONEL", "KEZIA"],
        summary:
          "By first light all sixteen bridges are wrapped in knitted scarves; the city stops to look, and Walter remembers every name.",
      },
    ],
  },
  {
    key: "heavy/h13/script",
    project: "highwire",
    format: "screenplay",
    cast: [
      { cue: "ROSA", name: "Rosa Mantell", called: "Rosa" },
      { cue: "OTTAVIO", name: "Ottavio Mantell", called: "Ottavio" },
      { cue: "BENNO", name: "Benno Mantell", called: "Benno" },
      { cue: "DULCIE", name: "Dulcie Cluett", called: "Dulcie" },
      { cue: "SOL", name: "Sol Ambrose", called: "Sol" },
    ],
    places: [
      { heading: "INT. BIG TOP - HIGH PLATFORM", spoken: "the high platform" },
      { heading: "INT. BIG TOP - RING", spoken: "the ring" },
      { heading: "INT. BIG TOP - RIGGING", spoken: "the rigging" },
      { heading: "INT. MANTELL WAGON", spoken: "the family wagon" },
      { heading: "EXT. FAIRGROUND FIELD", spoken: "the fairground field" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 18],
        timeOfDay: "NIGHT",
        places: ["INT. BIG TOP - HIGH PLATFORM", "INT. BIG TOP - RING"],
        cast: ["ROSA", "OTTAVIO"],
        summary:
          "From the high platform Rosa watches a half-empty tent while her father works the wire below; it is the last tour, and only she knows it.",
      },
      {
        scenes: [10, 20],
        pages: [18, 37],
        timeOfDay: "DAY",
        places: ["INT. MANTELL WAGON"],
        cast: ["OTTAVIO", "BENNO", "DULCIE"],
        summary:
          "Dulcie, who owns the ground and the tent, tells Ottavio the field is sold for houses; Benno hears it through the wagon wall.",
      },
      {
        scenes: [21, 30],
        pages: [37, 55],
        timeOfDay: "NIGHT",
        places: ["INT. BIG TOP - RIGGING"],
        cast: ["SOL", "ROSA"],
        summary:
          "Sol, the new rigger, climbs to Rosa's platform during the show and stays there, because he is more afraid of the ladder down.",
      },
      {
        scenes: [31, 41],
        pages: [55, 74],
        timeOfDay: "DAY",
        places: ["INT. BIG TOP - RING"],
        cast: ["BENNO", "OTTAVIO"],
        summary:
          "Benno wants a job in a city with a roof that stays put; Ottavio makes him walk the wire once more, and he does it better than his father.",
      },
      {
        scenes: [42, 51],
        pages: [74, 92],
        timeOfDay: "NIGHT",
        places: ["INT. BIG TOP - HIGH PLATFORM"],
        cast: ["ROSA", "OTTAVIO"],
        summary:
          "Ottavio's hands shake on the bar; Rosa takes his place in the act without telling the family, and nobody in the seats notices.",
      },
      {
        scenes: [52, 59],
        pages: [92, 108],
        timeOfDay: "DAWN",
        places: ["EXT. FAIRGROUND FIELD", "INT. BIG TOP - RING"],
        cast: ["ROSA", "OTTAVIO", "BENNO", "DULCIE", "SOL"],
        summary:
          "The last show is full; the tent comes down at dawn, and the family walk the wire one more time, laid out on the grass of the empty field.",
      },
    ],
  },
  {
    key: "heavy/h14/script",
    project: "the-understudys-understudy",
    format: "screenplay",
    cast: [
      { cue: "WILF", name: "Wilf Garbutt", called: "Wilf" },
      { cue: "LUCIAN", name: "Lucian Delahaye", called: "Lucian" },
      { cue: "POPPY", name: "Poppy Strang", called: "Poppy" },
      { cue: "AUGUSTA", name: "Augusta Penney", called: "Augusta" },
      { cue: "NEVILLE", name: "Neville Oduya", called: "Neville" },
    ],
    places: [
      { heading: "INT. PELLAM THEATRE - STAGE DOOR", spoken: "the stage door" },
      { heading: "INT. PELLAM THEATRE - STAGE", spoken: "the stage" },
      {
        heading: "INT. PELLAM THEATRE - NUMBER ONE DRESSING ROOM",
        spoken: "the number one dressing room",
      },
      { heading: "INT. PELLAM THEATRE - WINGS", spoken: "the wings" },
      { heading: "EXT. PELLAM THEATRE - ALLEY", spoken: "the alley" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 8],
        pages: [1, 16],
        timeOfDay: "NIGHT",
        places: ["INT. PELLAM THEATRE - STAGE DOOR"],
        cast: ["WILF", "LUCIAN"],
        summary:
          "Wilf has kept the stage door for thirty years and knows every line of the play from hearing it through the wall; Lucian signs in late again.",
      },
      {
        scenes: [9, 18],
        pages: [16, 33],
        timeOfDay: "DAY",
        places: ["INT. PELLAM THEATRE - STAGE"],
        cast: ["AUGUSTA", "POPPY", "NEVILLE"],
        summary:
          "Augusta rehearses Poppy, the understudy, who freezes at the same speech every time; Neville gives her an hour and a sandwich.",
      },
      {
        scenes: [19, 28],
        pages: [33, 50],
        timeOfDay: "NIGHT",
        places: ["INT. PELLAM THEATRE - NUMBER ONE DRESSING ROOM"],
        cast: ["LUCIAN", "WILF"],
        summary:
          "Lucian loses his voice an hour before curtain and Poppy has gone home ill; Wilf finds himself holding the crown.",
      },
      {
        scenes: [29, 38],
        pages: [50, 67],
        timeOfDay: "NIGHT",
        places: ["INT. PELLAM THEATRE - WINGS", "INT. PELLAM THEATRE - STAGE"],
        cast: ["WILF", "NEVILLE", "AUGUSTA"],
        summary:
          "Wilf goes on: he knows every word and none of the moves, and Neville steers him round the set by whispering from the wings.",
      },
      {
        scenes: [39, 47],
        pages: [67, 83],
        timeOfDay: "NIGHT",
        places: ["INT. PELLAM THEATRE - STAGE"],
        cast: ["WILF", "POPPY"],
        summary:
          "Poppy comes back for the second act and they play the scene together, both terrified, and the house goes quiet in the right way.",
      },
      {
        scenes: [48, 54],
        pages: [83, 98],
        timeOfDay: "DAY",
        places: [
          "INT. PELLAM THEATRE - STAGE DOOR",
          "EXT. PELLAM THEATRE - ALLEY",
        ],
        cast: ["WILF", "LUCIAN", "AUGUSTA", "POPPY"],
        summary:
          "Next day Lucian is back and Wilf is at the door again; Augusta leaves him a script with his name on the part of the old porter.",
      },
    ],
  },
  {
    key: "heavy/h15/script",
    project: "a-house-for-the-winter",
    format: "screenplay",
    cast: [
      { cue: "CLEMENCY", name: "Clemency Hart", called: "Clemency" },
      { cue: "RUFUS", name: "Rufus Penge", called: "Rufus" },
      { cue: "THEA", name: "Thea Hart", called: "Thea" },
      { cue: "JORY", name: "Jory Kitto", called: "Jory" },
      { cue: "MRS. SPRY", name: "Lavinia Spry", called: "Mrs. Spry" },
    ],
    places: [
      {
        heading: "INT. LIGHTHOUSE COTTAGE - KITCHEN",
        spoken: "the cottage kitchen",
      },
      {
        heading: "INT. LIGHTHOUSE COTTAGE - SPARE ROOM",
        spoken: "the spare room",
      },
      { heading: "EXT. LIGHTHOUSE COTTAGE - YARD", spoken: "the cottage yard" },
      { heading: "EXT. HEADLAND PATH", spoken: "the headland path" },
      { heading: "INT. HARBOUR OFFICE", spoken: "the harbour office" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 8],
        pages: [1, 15],
        timeOfDay: "DAY",
        places: [
          "EXT. LIGHTHOUSE COTTAGE - YARD",
          "INT. LIGHTHOUSE COTTAGE - KITCHEN",
        ],
        cast: ["CLEMENCY", "JORY"],
        summary:
          "Clemency buys the cottage under the old lighthouse with the last of her savings; Jory, the builder, says the roof will not see out the gales.",
      },
      {
        scenes: [9, 17],
        pages: [15, 31],
        timeOfDay: "NIGHT",
        places: ["INT. LIGHTHOUSE COTTAGE - SPARE ROOM"],
        cast: ["CLEMENCY", "RUFUS"],
        summary:
          "A storm brings Rufus to the door, soaked, with a suitcase and a cat; she lets him have the spare room for one night.",
      },
      {
        scenes: [18, 27],
        pages: [31, 48],
        timeOfDay: "DAY",
        places: ["INT. HARBOUR OFFICE"],
        cast: ["MRS. SPRY", "CLEMENCY"],
        summary:
          "Mrs. Spry at the harbour office knows Rufus: he has lodged in the cottage every year for twenty years, and he has a key.",
      },
      {
        scenes: [28, 36],
        pages: [48, 64],
        timeOfDay: "DAY",
        places: ["INT. LIGHTHOUSE COTTAGE - KITCHEN"],
        cast: ["RUFUS", "CLEMENCY", "JORY"],
        summary:
          "Rufus mends what Jory cannot and breaks what Jory has mended; Clemency throws him out, and he is back by supper.",
      },
      {
        scenes: [37, 45],
        pages: [64, 80],
        timeOfDay: "NIGHT",
        places: ["EXT. HEADLAND PATH"],
        cast: ["CLEMENCY", "THEA"],
        summary:
          "Thea comes to take her home and finds her sister arguing happily with a lodger on the headland in the rain.",
      },
      {
        scenes: [46, 52],
        pages: [80, 92],
        timeOfDay: "DAWN",
        places: [
          "EXT. LIGHTHOUSE COTTAGE - YARD",
          "INT. LIGHTHOUSE COTTAGE - SPARE ROOM",
        ],
        cast: ["CLEMENCY", "RUFUS", "MRS. SPRY"],
        summary:
          "The roof holds through the worst night of the year; Clemency writes Rufus a rent book, and he signs it with the cat's name.",
      },
    ],
  },
  {
    key: "heavy/h16/script",
    project: "the-beekeepers-accounts",
    format: "screenplay",
    cast: [
      { cue: "PERCIVAL", name: "Percival Thorne", called: "Percival" },
      { cue: "BRYONY", name: "Bryony Waddell", called: "Bryony" },
      { cue: "EZEKIEL", name: "Ezekiel Pryor", called: "Ezekiel" },
      { cue: "TILDA", name: "Tilda Pryor", called: "Tilda" },
      { cue: "MR. HAMNETT", name: "Leonard Hamnett", called: "Mr. Hamnett" },
    ],
    places: [
      {
        heading: "INT. AUDIT FIRM - HAMNETT'S OFFICE",
        spoken: "the senior partner's office",
      },
      {
        heading: "INT. HONEY CO-OPERATIVE - OFFICE",
        spoken: "the co-operative office",
      },
      { heading: "EXT. HILLSIDE APIARY", spoken: "the apiary" },
      { heading: "INT. EXTRACTING SHED", spoken: "the extracting shed" },
      {
        heading: "INT. VILLAGE INN - BACK BEDROOM",
        spoken: "the inn's back bedroom",
      },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 8],
        pages: [1, 16],
        timeOfDay: "DAY",
        places: ["INT. AUDIT FIRM - HAMNETT'S OFFICE"],
        cast: ["MR. HAMNETT", "PERCIVAL"],
        summary:
          "Mr. Hamnett sends Percival to close a honey co-operative whose books have not balanced since the year it opened.",
      },
      {
        scenes: [9, 18],
        pages: [16, 33],
        timeOfDay: "DAY",
        places: ["INT. HONEY CO-OPERATIVE - OFFICE"],
        cast: ["BRYONY", "PERCIVAL"],
        summary:
          "Bryony hands him nine ledgers in nine hands, one written in pencil and another kept in jars instead of pounds.",
      },
      {
        scenes: [19, 28],
        pages: [33, 50],
        timeOfDay: "DAY",
        places: ["EXT. HILLSIDE APIARY"],
        cast: ["EZEKIEL", "PERCIVAL", "TILDA"],
        summary:
          "Ezekiel will not talk figures until Percival has stood among the hives in a veil; Tilda counts the stings he does not admit to.",
      },
      {
        scenes: [29, 38],
        pages: [50, 67],
        timeOfDay: "NIGHT",
        places: ["INT. VILLAGE INN - BACK BEDROOM"],
        cast: ["PERCIVAL"],
        summary:
          "Alone at night with the ledgers, Percival finds they balance perfectly if a jar of honey is counted as a day's work.",
      },
      {
        scenes: [39, 47],
        pages: [67, 83],
        timeOfDay: "DAY",
        places: ["INT. EXTRACTING SHED"],
        cast: ["BRYONY", "PERCIVAL", "EZEKIEL", "TILDA"],
        summary:
          "He helps with the extraction and is stung eleven times; Bryony shows him the members' list, which is longer than the village.",
      },
      {
        scenes: [48, 54],
        pages: [83, 94],
        timeOfDay: "DAY",
        places: ["INT. AUDIT FIRM - HAMNETT'S OFFICE", "EXT. HILLSIDE APIARY"],
        cast: ["PERCIVAL", "MR. HAMNETT", "BRYONY"],
        summary:
          "Percival's report says the co-operative should stay open and be audited in jars; Hamnett signs it, and Percival moves to the village.",
      },
    ],
  },
  {
    key: "heavy/h17/script",
    project: "cold-reading",
    format: "screenplay",
    cast: [
      { cue: "TEDDY", name: "Teddy Lomax", called: "Teddy" },
      { cue: "CORAL", name: "Coral Lomax", called: "Coral" },
      { cue: "IMELDA", name: "Imelda Roake", called: "Imelda" },
      { cue: "RUBY", name: "Ruby Danesh", called: "Ruby" },
      { cue: "HORACE", name: "Horace Plumb", called: "Horace" },
    ],
    places: [
      { heading: "INT. ROSSITER HALL - STAGE", spoken: "the Rossiter stage" },
      {
        heading: "INT. ROSSITER HALL - DRESSING ROOM",
        spoken: "the Rossiter dressing room",
      },
      { heading: "INT. BOARDING HOUSE - RUBY'S ROOM", spoken: "the lodgings" },
      {
        heading: "INT. POLICE STATION - CORRIDOR",
        spoken: "the police corridor",
      },
      { heading: "EXT. END OF THE PIER", spoken: "the end of the pier" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "NIGHT",
        places: ["INT. ROSSITER HALL - STAGE"],
        cast: ["TEDDY", "CORAL"],
        summary:
          "Teddy reads minds twice nightly with Coral's signals from the stalls; the trick is old and so are they, and the house is a third full.",
      },
      {
        scenes: [10, 19],
        pages: [17, 34],
        timeOfDay: "NIGHT",
        places: ["INT. ROSSITER HALL - DRESSING ROOM"],
        cast: ["IMELDA", "TEDDY", "HORACE"],
        summary:
          "Imelda, a detective, comes backstage and asks him to read a witness who has not said a word since the night of a fire.",
      },
      {
        scenes: [20, 29],
        pages: [34, 51],
        timeOfDay: "DAY",
        places: ["INT. BOARDING HOUSE - RUBY'S ROOM"],
        cast: ["TEDDY", "RUBY", "IMELDA"],
        summary:
          "Teddy tells Imelda he cannot read anyone, then sits with Ruby for an hour and notices everything she does not say.",
      },
      {
        scenes: [30, 39],
        pages: [51, 68],
        timeOfDay: "NIGHT",
        places: ["INT. ROSSITER HALL - STAGE"],
        cast: ["CORAL", "TEDDY", "HORACE"],
        summary:
          "Coral refuses to give signals for a real case and Horace wants the publicity; the act falls apart in front of a full house.",
      },
      {
        scenes: [40, 48],
        pages: [68, 84],
        timeOfDay: "DAY",
        places: ["INT. POLICE STATION - CORRIDOR"],
        cast: ["TEDDY", "IMELDA", "RUBY"],
        summary:
          "With only what forty years of watching audiences taught him, Teddy works out who Ruby is protecting, and it is not herself.",
      },
      {
        scenes: [49, 55],
        pages: [84, 100],
        timeOfDay: "NIGHT",
        places: ["EXT. END OF THE PIER"],
        cast: ["TEDDY", "CORAL", "RUBY"],
        summary:
          "Ruby speaks at last, to Coral, not to him; on the pier Teddy admits he has never read a mind, and Coral says she always knew.",
      },
    ],
  },
  {
    key: "heavy/h18/script",
    project: "matchday",
    format: "screenplay",
    cast: [
      { cue: "LENNY", name: "Lenny Abara", called: "Lenny" },
      { cue: "DYLAN", name: "Dylan Fothergill", called: "Dylan" },
      { cue: "SHAY", name: "Shay Orr", called: "Shay" },
      { cue: "PAT", name: "Pat Gedge", called: "Pat" },
      { cue: "MRS. HOOD", name: "Bella Hood", called: "Mrs. Hood" },
    ],
    places: [
      { heading: "INT. CLUB MINIBUS", spoken: "the minibus" },
      {
        heading: "INT. DUNMARROW GROUND - HOME DRESSING ROOM",
        spoken: "the home dressing room",
      },
      { heading: "EXT. DUNMARROW GROUND - TOUCHLINE", spoken: "the touchline" },
      { heading: "INT. DUNMARROW GROUND - TEA HUT", spoken: "the tea hut" },
      {
        heading: "EXT. DUNMARROW GROUND - CLUBHOUSE TERRACE",
        spoken: "the clubhouse terrace",
      },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 8],
        pages: [1, 15],
        timeOfDay: "DAY",
        places: [
          "INT. CLUB MINIBUS",
          "INT. DUNMARROW GROUND - HOME DRESSING ROOM",
        ],
        cast: ["LENNY", "PAT", "DYLAN"],
        summary:
          "Ninety minutes before the biggest match in the club's history the minibus breaks down, and Pat finds the kit still in her garage.",
      },
      {
        scenes: [9, 16],
        pages: [15, 30],
        timeOfDay: "DAY",
        places: ["INT. DUNMARROW GROUND - HOME DRESSING ROOM"],
        cast: ["LENNY", "SHAY", "DYLAN"],
        summary:
          "Lenny's team talk is interrupted by Shay being sick and by Dylan finding his gloves have been washed with the shirts.",
      },
      {
        scenes: [17, 24],
        pages: [30, 45],
        timeOfDay: "DAY",
        places: ["EXT. DUNMARROW GROUND - TOUCHLINE"],
        cast: ["LENNY", "SHAY", "MRS. HOOD"],
        summary:
          "One down at half-time against a club whose stand is bigger than their whole ground; Mrs. Hood brings the oranges and the only good advice.",
      },
      {
        scenes: [25, 32],
        pages: [45, 60],
        timeOfDay: "DAY",
        places: [
          "INT. DUNMARROW GROUND - TEA HUT",
          "EXT. DUNMARROW GROUND - TOUCHLINE",
        ],
        cast: ["PAT", "MRS. HOOD", "LENNY"],
        summary:
          "The tea hut runs out of tea; Pat counts the crowd twice to be sure it is the biggest they have ever had, and it is.",
      },
      {
        scenes: [33, 40],
        pages: [60, 75],
        timeOfDay: "DAY",
        places: ["EXT. DUNMARROW GROUND - TOUCHLINE"],
        cast: ["SHAY", "DYLAN", "LENNY"],
        summary:
          "Shay equalises off his shin; Dylan saves a penalty with his face and plays on with a nosebleed and a grin.",
      },
      {
        scenes: [41, 46],
        pages: [75, 90],
        timeOfDay: "DUSK",
        places: ["EXT. DUNMARROW GROUND - CLUBHOUSE TERRACE"],
        cast: ["LENNY", "PAT", "SHAY", "DYLAN", "MRS. HOOD"],
        summary:
          "They lose in the last minute and the clubhouse sings anyway; Lenny frames the match ball, and the run is over.",
      },
    ],
  },
  {
    key: "heavy/h19/script",
    project: "the-last-tram-to-orrin-street",
    format: "screenplay",
    cast: [
      { cue: "CONRAD", name: "Conrad Mellish", called: "Conrad" },
      { cue: "WINNIE", name: "Winnie Lusk", called: "Winnie" },
      { cue: "RAVI", name: "Ravi Sethna", called: "Ravi" },
      { cue: "MO", name: "Mo Tinsley", called: "Mo" },
      { cue: "CLARA", name: "Clara Beck", called: "Clara" },
      { cue: "ARCHIE", name: "Archie Venn", called: "Archie" },
      { cue: "DELIA", name: "Delia Farr", called: "Delia" },
    ],
    places: [
      { heading: "EXT. TRAM DEPOT - YARD", spoken: "the depot yard" },
      { heading: "INT. LAST TRAM - DRIVER'S CAB", spoken: "the driver's cab" },
      { heading: "INT. LAST TRAM - LOWER DECK", spoken: "the lower deck" },
      { heading: "EXT. CANAL BRIDGE STOP", spoken: "the canal bridge stop" },
      {
        heading: "EXT. ORRIN STREET - TERMINUS",
        spoken: "the Orrin Street terminus",
      },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 8],
        pages: [1, 15],
        timeOfDay: "NIGHT",
        places: ["EXT. TRAM DEPOT - YARD", "INT. LAST TRAM - DRIVER'S CAB"],
        cast: ["CONRAD"],
        summary:
          "Conrad takes the last tram out of the depot for the last time; tomorrow the rails come up and the line becomes a bus.",
      },
      {
        scenes: [9, 17],
        pages: [15, 30],
        timeOfDay: "NIGHT",
        places: ["INT. LAST TRAM - LOWER DECK"],
        cast: ["WINNIE", "RAVI", "MO", "CONRAD"],
        summary:
          "Winnie rides it because she always has; Ravi is late for a night shift; Mo has a bunch of flowers and no idea who they are for.",
      },
      {
        scenes: [18, 26],
        pages: [30, 45],
        timeOfDay: "NIGHT",
        places: ["EXT. CANAL BRIDGE STOP", "INT. LAST TRAM - LOWER DECK"],
        cast: ["CLARA", "ARCHIE", "DELIA"],
        summary:
          "At the canal bridge Clara gets on with a suitcase and Archie with a trumpet; Delia, a ticket inspector off duty, checks them anyway.",
      },
      {
        scenes: [27, 35],
        pages: [45, 60],
        timeOfDay: "NIGHT",
        places: ["INT. LAST TRAM - LOWER DECK"],
        cast: ["ARCHIE", "MO", "WINNIE", "CLARA"],
        summary:
          "The power fails between stops; Archie plays in the dark, and Mo gives the flowers to Winnie because she is the one who is crying.",
      },
      {
        scenes: [36, 43],
        pages: [60, 75],
        timeOfDay: "NIGHT",
        places: [
          "INT. LAST TRAM - DRIVER'S CAB",
          "INT. LAST TRAM - LOWER DECK",
        ],
        cast: ["CONRAD", "RAVI", "DELIA"],
        summary:
          "Conrad and Ravi push the tram the last yards to the live wire, with Delia shouting directions from the step.",
      },
      {
        scenes: [44, 50],
        pages: [75, 88],
        timeOfDay: "DAWN",
        places: ["EXT. ORRIN STREET - TERMINUS"],
        cast: ["CONRAD", "WINNIE", "RAVI", "MO", "CLARA", "ARCHIE", "DELIA"],
        summary:
          "They reach Orrin Street at dawn; nobody gets off for a while, and then everyone does, and Conrad rings the bell once for the line.",
      },
    ],
  },
  {
    key: "heavy/h20/script",
    project: "snowline",
    format: "screenplay",
    cast: [
      { cue: "AILSA", name: "Ailsa Rennick", called: "Ailsa" },
      { cue: "TOBIN", name: "Tobin Carse", called: "Tobin" },
      { cue: "MERRYN", name: "Merryn Carse", called: "Merryn" },
      { cue: "DUNCAN", name: "Duncan Laverock", called: "Duncan" },
      { cue: "FRASER", name: "Fraser Ord", called: "Fraser" },
    ],
    places: [
      { heading: "INT. RESCUE POST", spoken: "the rescue post" },
      { heading: "EXT. RIDGE - ABOVE THE SNOWLINE", spoken: "the ridge" },
      { heading: "INT. AILSA'S HOUSE - KITCHEN", spoken: "the croft kitchen" },
      { heading: "EXT. BOTHY", spoken: "the bothy" },
      { heading: "EXT. SCREE SLOPE", spoken: "the scree slope" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 18],
        timeOfDay: "NIGHT",
        places: ["INT. RESCUE POST", "EXT. RIDGE - ABOVE THE SNOWLINE"],
        cast: ["AILSA", "DUNCAN", "TOBIN"],
        summary:
          "Twenty years ago: Ailsa, a new volunteer, searches the ridge all night for a walker, Tobin, and is sent down before she finds him.",
      },
      {
        scenes: [10, 20],
        pages: [18, 37],
        timeOfDay: "DAY",
        places: ["INT. AILSA'S HOUSE - KITCHEN"],
        cast: ["AILSA", "MERRYN"],
        summary:
          "Now: Merryn, the walker's daughter, knocks on Ailsa's door with his last postcard and asks her to look one more time.",
      },
      {
        scenes: [21, 31],
        pages: [37, 56],
        timeOfDay: "DAY",
        places: ["INT. RESCUE POST"],
        cast: ["DUNCAN", "AILSA", "FRASER"],
        summary:
          "Duncan, long retired, still has the search map; Fraser, who leads the team now, will not risk anyone for a man twenty years gone.",
      },
      {
        scenes: [32, 42],
        pages: [56, 75],
        timeOfDay: "DUSK",
        places: ["EXT. BOTHY"],
        cast: ["AILSA", "MERRYN"],
        summary:
          "Ailsa and Merryn walk up alone and sleep in the bothy where Tobin signed the book; his last line describes a path nobody uses.",
      },
      {
        scenes: [43, 51],
        pages: [75, 92],
        timeOfDay: "DAY",
        places: ["EXT. SCREE SLOPE"],
        cast: ["AILSA", "MERRYN", "FRASER"],
        summary:
          "The path ends at a scree slope; Fraser and the team come after them anyway, because Ailsa once came after him.",
      },
      {
        scenes: [52, 58],
        pages: [92, 106],
        timeOfDay: "DUSK",
        places: ["EXT. RIDGE - ABOVE THE SNOWLINE"],
        cast: ["AILSA", "MERRYN", "DUNCAN"],
        summary:
          "They find Tobin's pack, not Tobin, with a note to Merryn inside; Ailsa reads the snowline as he must have, and lets the search end.",
      },
    ],
  },
  {
    key: "heavy/h21/script",
    project: "pigeon-post",
    format: "screenplay",
    cast: [
      { cue: "MORTIMER", name: "Mortimer Biddle", called: "Mortimer" },
      { cue: "IRIS", name: "Iris Penhallow", called: "Iris" },
      { cue: "MRS. KIBBLE", name: "Dorothea Kibble", called: "Mrs. Kibble" },
      { cue: "STANLEY", name: "Stanley Rook", called: "Stanley" },
    ],
    places: [
      { heading: "INT. SHIPPING OFFICE", spoken: "the shipping office" },
      { heading: "INT. MORTIMER'S FLAT", spoken: "the top-floor flat" },
      { heading: "EXT. ROOFTOP LOFT", spoken: "the pigeon loft" },
      { heading: "INT. IRIS'S FLAT", spoken: "the flat across the street" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 1],
        pages: [1, 2],
        timeOfDay: "DAY",
        places: ["INT. SHIPPING OFFICE"],
        cast: ["MORTIMER", "STANLEY"],
        summary:
          "Mortimer copies invoices all day; Stanley, who races pigeons, lends him a bird to cheer him up.",
      },
      {
        scenes: [2, 2],
        pages: [2, 3],
        timeOfDay: "NIGHT",
        places: ["INT. MORTIMER'S FLAT"],
        cast: ["MORTIMER", "MRS. KIBBLE"],
        summary:
          "Mrs. Kibble forbids pets; Mortimer hides the pigeon in a hatbox and watches the lit window across the street.",
      },
      {
        scenes: [3, 4],
        pages: [3, 5],
        timeOfDay: "DAY",
        places: ["EXT. ROOFTOP LOFT"],
        cast: ["MORTIMER", "STANLEY"],
        summary:
          "He sends his first letter by pigeon to the flat across the street; it comes back unopened, with a crumb of cake.",
      },
      {
        scenes: [5, 5],
        pages: [5, 7],
        timeOfDay: "NIGHT",
        places: ["INT. IRIS'S FLAT"],
        cast: ["IRIS"],
        summary:
          "Iris reads the second letter and writes back on the reverse, about the weather and nothing else.",
      },
      {
        scenes: [6, 7],
        pages: [7, 9],
        timeOfDay: "DAY",
        places: ["INT. MORTIMER'S FLAT", "EXT. ROOFTOP LOFT"],
        cast: ["MORTIMER", "MRS. KIBBLE", "IRIS"],
        summary:
          "The letters get longer and the pigeon gets fatter; Mrs. Kibble finds the hatbox and keeps the secret.",
      },
      {
        scenes: [8, 8],
        pages: [9, 10],
        timeOfDay: "NIGHT",
        places: ["INT. IRIS'S FLAT"],
        cast: ["MORTIMER", "IRIS"],
        summary:
          "The pigeon will not fly in the rain, so Mortimer crosses the street and knocks, holding the letter himself.",
      },
    ],
  },
  {
    key: "heavy/h22/script",
    project: "second-unit",
    format: "screenplay",
    cast: [
      { cue: "NORMA", name: "Norma Pask", called: "Norma" },
      { cue: "TAD", name: "Tad Brannigan", called: "Tad" },
      { cue: "LOTTIE", name: "Lottie Ames", called: "Lottie" },
      { cue: "KWESI", name: "Kwesi Antwi", called: "Kwesi" },
      { cue: "JULIAN", name: "Julian Moberly", called: "Julian" },
    ],
    places: [
      {
        heading: "EXT. CLIFF ROAD - CAMERA POSITION",
        spoken: "the camera position",
      },
      { heading: "INT. UNIT BASE - CATERING BUS", spoken: "the catering bus" },
      { heading: "INT. PRODUCTION OFFICE", spoken: "the production office" },
      { heading: "EXT. QUARRY", spoken: "the quarry" },
      { heading: "INT. RUSHES THEATRE", spoken: "the rushes theatre" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 18],
        timeOfDay: "DAY",
        places: ["EXT. CLIFF ROAD - CAMERA POSITION"],
        cast: ["NORMA", "TAD", "LOTTIE"],
        summary:
          "Norma's second unit shoots hands, cars and doors for a film whose stars never meet them; today it is forty takes of a kettle.",
      },
      {
        scenes: [10, 20],
        pages: [18, 37],
        timeOfDay: "DAY",
        places: ["INT. UNIT BASE - CATERING BUS"],
        cast: ["KWESI", "NORMA", "TAD"],
        summary:
          "Kwesi, the runner, overhears that the main unit has lost its one great shot, the sunrise over the quarry, to rain and a late star.",
      },
      {
        scenes: [21, 31],
        pages: [37, 56],
        timeOfDay: "NIGHT",
        places: ["INT. PRODUCTION OFFICE"],
        cast: ["JULIAN", "NORMA"],
        summary:
          "Julian, the director, will not hand the shot to a unit he has never met; Norma asks for one dawn and is given none.",
      },
      {
        scenes: [32, 42],
        pages: [56, 75],
        timeOfDay: "DAWN",
        places: ["EXT. QUARRY"],
        cast: ["NORMA", "TAD", "LOTTIE", "KWESI"],
        summary:
          "They go anyway, without permission, with a borrowed crane and Kwesi standing in for the star in a borrowed coat.",
      },
      {
        scenes: [43, 52],
        pages: [75, 94],
        timeOfDay: "DAWN",
        places: ["EXT. QUARRY"],
        cast: ["TAD", "LOTTIE", "NORMA"],
        summary:
          "The cloud breaks for ninety seconds; Lottie pulls focus from memory and Tad holds the shot until the light is gone.",
      },
      {
        scenes: [53, 58],
        pages: [94, 104],
        timeOfDay: "DAY",
        places: ["INT. RUSHES THEATRE"],
        cast: ["JULIAN", "NORMA", "KWESI", "TAD", "LOTTIE"],
        summary:
          "In rushes the shot is better than anything the main unit has; Julian uses it, and the credits get the second unit's names wrong.",
      },
    ],
  },
  {
    key: "heavy/h23/script",
    project: "gentle-machines",
    format: "screenplay",
    cast: [
      { cue: "TINKER", name: "Tinker", called: "Tinker" },
      { cue: "GWILYM", name: "Gwilym Probert", called: "Gwilym" },
      { cue: "SADIE", name: "Sadie Lorne", called: "Sadie" },
      { cue: "MRS. TRELOAR", name: "Agnes Treloar", called: "Mrs. Treloar" },
      { cue: "BENJI", name: "Benji Coker", called: "Benji" },
    ],
    places: [
      { heading: "INT. REPAIR SHOP", spoken: "the repair shop" },
      { heading: "EXT. SEAFRONT - PROMENADE", spoken: "the promenade" },
      { heading: "INT. AMUSEMENT ARCADE", spoken: "the arcade" },
      {
        heading: "INT. MRS. TRELOAR'S PARLOUR",
        spoken: "the front parlour",
      },
      { heading: "EXT. SLIPWAY", spoken: "the slipway" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "DAY",
        places: ["INT. REPAIR SHOP"],
        cast: ["GWILYM", "TINKER"],
        summary:
          "Gwilym, retiring, leaves his seaside repair shop to the robot he built to sweep it; Tinker can fix anything and knows nobody's name.",
      },
      {
        scenes: [10, 19],
        pages: [17, 34],
        timeOfDay: "DAY",
        places: ["EXT. SEAFRONT - PROMENADE", "INT. AMUSEMENT ARCADE"],
        cast: ["TINKER", "BENJI", "SADIE"],
        summary:
          "Tinker mends the arcade's crane machine for Sadie and a bicycle for Benji, and asks each of them what they are called.",
      },
      {
        scenes: [20, 28],
        pages: [34, 50],
        timeOfDay: "DAY",
        places: ["INT. MRS. TRELOAR'S PARLOUR"],
        cast: ["MRS. TRELOAR", "TINKER"],
        summary:
          "Mrs. Treloar's clock has been stopped since her husband died; she will not let it be fixed, only dusted, and Tinker dusts it every week.",
      },
      {
        scenes: [29, 38],
        pages: [50, 67],
        timeOfDay: "NIGHT",
        places: ["INT. REPAIR SHOP"],
        cast: ["TINKER", "BENJI"],
        summary:
          "Tinker writes every name on the inside of its panel; Benji reads the list and finds it has left itself off.",
      },
      {
        scenes: [39, 47],
        pages: [67, 83],
        timeOfDay: "NIGHT",
        places: ["EXT. SLIPWAY"],
        cast: ["TINKER", "SADIE", "BENJI"],
        summary:
          "In a storm Tinker wades out to fix the lifeboat winch and comes back with seawater in every joint.",
      },
      {
        scenes: [48, 54],
        pages: [83, 96],
        timeOfDay: "DAY",
        places: ["INT. REPAIR SHOP", "INT. MRS. TRELOAR'S PARLOUR"],
        cast: ["GWILYM", "MRS. TRELOAR", "SADIE", "BENJI", "TINKER"],
        summary:
          "The whole town takes turns to mend Tinker, badly; Mrs. Treloar lets the clock be started again, and Tinker learns its own name from them.",
      },
    ],
  },
  {
    key: "heavy/h27/101",
    project: "small-claims",
    format: "screenplay",
    cast: [
      {
        cue: "JUDGE MULVEY",
        name: "Judge Harriet Mulvey",
        called: "Judge Mulvey",
      },
      { cue: "OTIS", name: "Otis Gamble", called: "Otis" },
      { cue: "KEN", name: "Ken Shillito", called: "Ken" },
      { cue: "MAXINE", name: "Maxine Shillito", called: "Maxine" },
      { cue: "ROCCO", name: "Rocco Dent", called: "Rocco" },
    ],
    places: [
      { heading: "INT. COUNTY COURT - ROOM FOUR", spoken: "court room four" },
      {
        heading: "INT. COUNTY COURT - JUDGE'S CHAMBERS",
        spoken: "the judge's chambers",
      },
      { heading: "INT. COUNTY COURT - CORRIDOR", spoken: "the court corridor" },
      { heading: "INT. CELLAR BAR - OPEN MIC", spoken: "the cellar bar" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 3],
        pages: [1, 6],
        timeOfDay: "DAY",
        places: ["INT. COUNTY COURT - ROOM FOUR"],
        cast: ["JUDGE MULVEY", "KEN", "MAXINE", "OTIS"],
        summary:
          "Judge Mulvey hears a couple's claim over a garden gnome and gets her first laugh from the public seats in eleven years.",
      },
      {
        scenes: [4, 6],
        pages: [6, 11],
        timeOfDay: "DAY",
        places: ["INT. COUNTY COURT - JUDGE'S CHAMBERS"],
        cast: ["OTIS", "JUDGE MULVEY"],
        summary:
          "Otis, her clerk, finds the notebook of jokes in her drawer and reads one aloud before he knows what it is.",
      },
      {
        scenes: [7, 9],
        pages: [11, 17],
        timeOfDay: "NIGHT",
        places: ["INT. CELLAR BAR - OPEN MIC"],
        cast: ["ROCCO", "JUDGE MULVEY"],
        summary:
          "She signs up for Rocco's open mic under her mother's name and stands through four minutes of silence.",
      },
      {
        scenes: [10, 12],
        pages: [17, 22],
        timeOfDay: "DAY",
        places: ["INT. COUNTY COURT - ROOM FOUR"],
        cast: ["KEN", "MAXINE", "JUDGE MULVEY"],
        summary:
          "Ken and Maxine are back with a second claim, about the gnome's hat, and she uses their case to rewrite her act.",
      },
      {
        scenes: [13, 15],
        pages: [22, 27],
        timeOfDay: "DAY",
        places: ["INT. COUNTY COURT - CORRIDOR"],
        cast: ["OTIS", "ROCCO"],
        summary:
          "Rocco turns up at court to bring a claim of his own and recognises the judge; Otis tries to keep them in different rooms.",
      },
      {
        scenes: [16, 18],
        pages: [27, 32],
        timeOfDay: "NIGHT",
        places: ["INT. CELLAR BAR - OPEN MIC"],
        cast: ["JUDGE MULVEY", "OTIS", "KEN", "MAXINE", "ROCCO"],
        summary:
          "Her second set is all small claims, names changed; Ken and Maxine are in the front row and laugh hardest at themselves.",
      },
    ],
  },
  {
    key: "heavy/h28/101",
    project: "the-night-porter",
    format: "screenplay",
    cast: [
      { cue: "ALBERT", name: "Albert Fenn", called: "Albert" },
      { cue: "CELESTINE", name: "Celestine Amory", called: "Celestine" },
      {
        cue: "MR. FAIRWEATHER",
        name: "Roland Fairweather",
        called: "Mr. Fairweather",
      },
      { cue: "PRITI", name: "Priti Sandhu", called: "Priti" },
      { cue: "MAJOR HUME", name: "Major Gerrard Hume", called: "Major Hume" },
    ],
    places: [
      {
        heading: "INT. HOTEL WRENFIELD - NIGHT DESK",
        spoken: "the night desk",
      },
      {
        heading: "INT. HOTEL WRENFIELD - FOURTH FLOOR CORRIDOR",
        spoken: "the fourth-floor corridor",
      },
      {
        heading: "INT. HOTEL WRENFIELD - KITCHEN",
        spoken: "the hotel kitchen",
      },
      { heading: "INT. HOTEL WRENFIELD - LIFT", spoken: "the hotel lift" },
      {
        heading: "INT. HOTEL WRENFIELD - PORTER'S CUPBOARD",
        spoken: "the porter's cupboard",
      },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 6],
        pages: [1, 11],
        timeOfDay: "NIGHT",
        places: ["INT. HOTEL WRENFIELD - NIGHT DESK"],
        cast: ["ALBERT", "PRITI"],
        summary:
          "Albert has been the night porter for twenty-two years; on Priti's first shift he names every guest by the sound of their footsteps.",
      },
      {
        scenes: [7, 12],
        pages: [11, 21],
        timeOfDay: "NIGHT",
        places: ["INT. HOTEL WRENFIELD - FOURTH FLOOR CORRIDOR"],
        cast: ["CELESTINE", "ALBERT"],
        summary:
          "Celestine Amory, who has lived in the hotel since before Albert came, asks him to carry a locked case to the kitchen and not look inside.",
      },
      {
        scenes: [13, 18],
        pages: [21, 31],
        timeOfDay: "NIGHT",
        places: ["INT. HOTEL WRENFIELD - KITCHEN"],
        cast: ["MAJOR HUME", "ALBERT", "PRITI"],
        summary:
          "Major Hume is found eating cold soup in the kitchen at three; Albert keeps his secret, and Priti writes it down.",
      },
      {
        scenes: [19, 24],
        pages: [31, 41],
        timeOfDay: "DAY",
        places: ["INT. HOTEL WRENFIELD - NIGHT DESK"],
        cast: ["MR. FAIRWEATHER", "PRITI"],
        summary:
          "Mr. Fairweather plans to sell the hotel and asks Priti what the night porter knows; she says nothing, which is new for her.",
      },
      {
        scenes: [25, 29],
        pages: [41, 50],
        timeOfDay: "NIGHT",
        places: ["INT. HOTEL WRENFIELD - LIFT"],
        cast: ["ALBERT", "CELESTINE", "PRITI"],
        summary:
          "The lift sticks between floors with Albert and Celestine inside; she asks him, at last, one question about himself.",
      },
      {
        scenes: [30, 32],
        pages: [50, 58],
        timeOfDay: "DAWN",
        places: [
          "INT. HOTEL WRENFIELD - PORTER'S CUPBOARD",
          "INT. HOTEL WRENFIELD - NIGHT DESK",
        ],
        cast: ["ALBERT", "PRITI", "MR. FAIRWEATHER", "MAJOR HUME"],
        summary:
          "Priti opens the porter's cupboard and finds no secrets of Albert's at all, only the guests' lost umbrellas, labelled and kept.",
      },
    ],
  },
  {
    key: "heavy/h29/101",
    project: "tidecallers",
    format: "screenplay",
    cast: [
      { cue: "ELOWEN", name: "Elowen Jago", called: "Elowen" },
      { cue: "KERENSA", name: "Kerensa Jago", called: "Kerensa" },
      { cue: "JOWAN", name: "Jowan Pascoe", called: "Jowan" },
      { cue: "HEDLEY", name: "Hedley Pascoe", called: "Hedley" },
      {
        cue: "CAPTAIN HOCKING",
        name: "Captain Senara Hocking",
        called: "Captain Hocking",
      },
    ],
    places: [
      { heading: "EXT. ARDLE QUAY - TIDE POST", spoken: "the tide post" },
      { heading: "INT. JAGO COTTAGE - TIDE ROOM", spoken: "the tide room" },
      {
        heading: "INT. PASCOE COTTAGE - KITCHEN",
        spoken: "the quayside kitchen",
      },
      {
        heading: "INT. HARBOUR MASTER'S OFFICE",
        spoken: "the harbour master's office",
      },
      { heading: "EXT. ARDLE BAR - SANDBANK", spoken: "the sandbank" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 5],
        pages: [1, 10],
        timeOfDay: "DAWN",
        places: ["EXT. ARDLE QUAY - TIDE POST"],
        cast: ["KERENSA", "ELOWEN"],
        summary:
          "Kerensa Jago has called the Ardle fleet's tides for fifty years; this morning she calls one wrong, and only Elowen hears it.",
      },
      {
        scenes: [6, 10],
        pages: [10, 19],
        timeOfDay: "DAY",
        places: ["INT. JAGO COTTAGE - TIDE ROOM"],
        cast: ["ELOWEN", "KERENSA"],
        summary:
          "In the tide room the old tables are written in three hands; Elowen finds the last ten years are in her grandmother's hand alone.",
      },
      {
        scenes: [11, 15],
        pages: [19, 29],
        timeOfDay: "DAY",
        places: ["INT. PASCOE COTTAGE - KITCHEN"],
        cast: ["HEDLEY", "JOWAN"],
        summary:
          "Hedley Pascoe wants the tide post for his own family; Jowan has been reading the tides in secret and is better at it than his father.",
      },
      {
        scenes: [16, 20],
        pages: [29, 38],
        timeOfDay: "NIGHT",
        places: ["INT. HARBOUR MASTER'S OFFICE"],
        cast: ["CAPTAIN HOCKING", "HEDLEY", "KERENSA"],
        summary:
          "Captain Hocking asks for a trial: each family calls the next big tide, and the fleet sails on the better call.",
      },
      {
        scenes: [21, 25],
        pages: [38, 47],
        timeOfDay: "DAWN",
        places: ["EXT. ARDLE BAR - SANDBANK"],
        cast: ["ELOWEN", "JOWAN"],
        summary:
          "Elowen and Jowan walk the sandbank at low water and agree, without saying so, on the same call.",
      },
      {
        scenes: [26, 30],
        pages: [47, 56],
        timeOfDay: "DAY",
        places: ["EXT. ARDLE QUAY - TIDE POST"],
        cast: ["ELOWEN", "JOWAN", "KERENSA", "HEDLEY", "CAPTAIN HOCKING"],
        summary:
          "Both families give the same tide; Kerensa hands the post to the two of them together, and Hedley says nothing for once.",
      },
    ],
  },
  {
    key: "heavy/h36/script",
    project: "moss-and-pebble-puddle-hunt",
    format: "ink",
    cast: [
      { cue: "MOSS", name: "Moss", called: "Moss" },
      { cue: "PEBBLE", name: "Pebble", called: "Pebble" },
      { cue: "ZIP", name: "Zip", called: "Zip" },
      { cue: "OLD NEWT", name: "Old Newt", called: "Old Newt" },
      { cue: "HERON", name: "Heron", called: "Heron" },
    ],
    places: [
      { heading: "EXT. POND - STEPPING STONES", spoken: "the stepping stones" },
      { heading: "EXT. GARDEN PATH - PUDDLES", spoken: "the puddles" },
      { heading: "EXT. POND - REEDS", spoken: "the reeds" },
      { heading: "EXT. GARDEN - BIG FLOWERPOT", spoken: "the big flowerpot" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 2],
        pages: [1, 3],
        timeOfDay: "DAY",
        places: ["EXT. POND - STEPPING STONES"],
        cast: ["MOSS", "PEBBLE"],
        summary:
          "After the rain Moss and Pebble find the pond has spilled into puddles all over the garden, and Pebble wants to count them.",
      },
      {
        scenes: [3, 4],
        pages: [3, 5],
        timeOfDay: "DAY",
        places: ["EXT. GARDEN PATH - PUDDLES"],
        cast: ["PEBBLE", "ZIP"],
        summary:
          "Zip zooms through the first puddle and splashes everyone; the player chooses who jumps in next.",
      },
      {
        scenes: [5, 7],
        pages: [5, 8],
        timeOfDay: "DAY",
        places: ["EXT. POND - REEDS"],
        cast: ["OLD NEWT", "MOSS"],
        summary:
          "Old Newt says the biggest puddle of all is hiding somewhere, and gives a clue that only makes sense backwards.",
      },
      {
        scenes: [8, 9],
        pages: [8, 10],
        timeOfDay: "DAY",
        places: ["EXT. GARDEN - BIG FLOWERPOT"],
        cast: ["PEBBLE", "MOSS", "ZIP"],
        summary:
          "Pebble rolls into the big flowerpot and cannot roll out; the player helps Moss and Zip choose how to tip it.",
      },
      {
        scenes: [10, 12],
        pages: [10, 12],
        timeOfDay: "DAY",
        places: ["EXT. POND - REEDS", "EXT. GARDEN PATH - PUDDLES"],
        cast: ["HERON", "PEBBLE"],
        summary:
          "Heron stands very still in a puddle that is really the sky looking back, and Pebble finally sees it.",
      },
      {
        scenes: [13, 14],
        pages: [12, 14],
        timeOfDay: "DUSK",
        places: ["EXT. POND - STEPPING STONES"],
        cast: ["MOSS", "PEBBLE", "ZIP", "OLD NEWT", "HERON"],
        summary:
          "The biggest puddle is the pond itself; everyone jumps in together, and the player gets to choose the last plop.",
      },
    ],
  },
  {
    key: "heavy/h37/script",
    project: "lowlight",
    format: "screenplay",
    cast: [
      { cue: "MARNIE", name: "Marnie Ostrow", called: "Marnie" },
      { cue: "VERNON", name: "Vernon Abbs", called: "Vernon" },
      { cue: "GUSSIE", name: "Gussie Mayhew", called: "Gussie" },
      { cue: "SASKIA", name: "Saskia Brune", called: "Saskia" },
      { cue: "IMRAN", name: "Imran Tavener", called: "Imran" },
    ],
    places: [
      {
        heading: "INT. TOURING THEATRE - EMPTY STAGE",
        spoken: "the empty stage",
      },
      {
        heading: "INT. TOURING THEATRE - LIGHTING BOX",
        spoken: "the lighting box",
      },
      { heading: "INT. TOUR BUS", spoken: "the tour bus" },
      {
        heading: "INT. THEATRE MUSEUM - STORE ROOM",
        spoken: "the museum store room",
      },
      { heading: "INT. DIGS - MARNIE'S ROOM", spoken: "the digs" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "NIGHT",
        places: ["INT. TOURING THEATRE - EMPTY STAGE"],
        cast: ["MARNIE", "VERNON"],
        summary:
          "Marnie sets the ghost light on an empty stage after the show and notices a scratch on its cage that she made herself, in another town.",
      },
      {
        scenes: [10, 19],
        pages: [17, 34],
        timeOfDay: "DAY",
        places: ["INT. TOUR BUS"],
        cast: ["MARNIE", "IMRAN"],
        summary:
          "On the tour bus she goes through her photographs: nine theatres in nine towns, the same lamp, the same cage, the same scratch.",
      },
      {
        scenes: [20, 29],
        pages: [34, 51],
        timeOfDay: "NIGHT",
        places: ["INT. TOURING THEATRE - LIGHTING BOX"],
        cast: ["GUSSIE", "MARNIE"],
        summary:
          "Gussie, a stage carpenter older than the building, says every company once carried its own ghost light, and that this one has never been claimed.",
      },
      {
        scenes: [30, 39],
        pages: [51, 68],
        timeOfDay: "DAY",
        places: ["INT. THEATRE MUSEUM - STORE ROOM"],
        cast: ["SASKIA", "MARNIE"],
        summary:
          "Saskia finds the lamp in a photograph of a theatre that burned down a century ago, standing on the stage in the ashes.",
      },
      {
        scenes: [40, 48],
        pages: [68, 84],
        timeOfDay: "NIGHT",
        places: [
          "INT. TOURING THEATRE - EMPTY STAGE",
          "INT. TOURING THEATRE - LIGHTING BOX",
        ],
        cast: ["MARNIE", "VERNON", "IMRAN"],
        summary:
          "Marnie refuses to switch it on; the company plays the next show by torchlight, and it is the best they have done.",
      },
      {
        scenes: [49, 55],
        pages: [84, 100],
        timeOfDay: "NIGHT",
        places: [
          "INT. DIGS - MARNIE'S ROOM",
          "INT. TOURING THEATRE - EMPTY STAGE",
        ],
        cast: ["MARNIE", "GUSSIE"],
        summary:
          "On the last night of the tour she leaves the light burning in the last theatre and walks out, and in the morning it is gone.",
      },
    ],
  },
  {
    key: "heavy/h38/script",
    project: "rooftop-summer",
    format: "screenplay",
    cast: [
      { cue: "LORNA", name: "Lorna Pickering", called: "Lorna" },
      { cue: "NAT", name: "Nat Pemberton", called: "Nat" },
      { cue: "FRIEDA", name: "Frieda Gorman", called: "Frieda" },
      { cue: "OBI", name: "Obi Nnaji", called: "Obi" },
      { cue: "MR. ASHWORTH", name: "Clement Ashworth", called: "Mr. Ashworth" },
    ],
    places: [
      {
        heading: "EXT. DEPARTMENT STORE - ROOF GARDEN",
        spoken: "the roof garden",
      },
      {
        heading: "INT. DEPARTMENT STORE - HABERDASHERY",
        spoken: "haberdashery",
      },
      {
        heading: "INT. DEPARTMENT STORE - STAFF CANTEEN",
        spoken: "the staff canteen",
      },
      {
        heading: "INT. DEPARTMENT STORE - GOODS LIFT",
        spoken: "the goods lift",
      },
      {
        heading: "EXT. DEPARTMENT STORE - LOADING BAY",
        spoken: "the loading bay",
      },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "DAY",
        places: ["EXT. DEPARTMENT STORE - ROOF GARDEN"],
        cast: ["LORNA", "NAT", "FRIEDA", "OBI"],
        summary:
          "Four strangers find the same locked door to the roof of a closing department store: Lorna, Nat, Frieda and Obi, each with a watering can.",
      },
      {
        scenes: [10, 19],
        pages: [17, 34],
        timeOfDay: "DAY",
        places: [
          "INT. DEPARTMENT STORE - HABERDASHERY",
          "INT. DEPARTMENT STORE - STAFF CANTEEN",
        ],
        cast: ["MR. ASHWORTH", "LORNA"],
        summary:
          "Mr. Ashworth, the last manager, admits he has watered the garden alone for six years and can no longer climb the stairs.",
      },
      {
        scenes: [20, 28],
        pages: [34, 50],
        timeOfDay: "DAY",
        places: ["EXT. DEPARTMENT STORE - ROOF GARDEN"],
        cast: ["NAT", "OBI"],
        summary:
          "Nat and Obi rebuild the beds with shelving from the empty floors below, and argue about tomatoes until it rains.",
      },
      {
        scenes: [29, 38],
        pages: [50, 67],
        timeOfDay: "NIGHT",
        places: ["INT. DEPARTMENT STORE - GOODS LIFT"],
        cast: ["FRIEDA", "LORNA"],
        summary:
          "Frieda and Lorna get stuck in the goods lift with a pear tree in a tub, and find out they grew up on the same street.",
      },
      {
        scenes: [39, 47],
        pages: [67, 83],
        timeOfDay: "DAY",
        places: ["EXT. DEPARTMENT STORE - LOADING BAY"],
        cast: ["MR. ASHWORTH", "OBI", "NAT"],
        summary:
          "The closing date is set; the buyers want the roof cleared by the last day, and Mr. Ashworth signs the order with his eyes shut.",
      },
      {
        scenes: [48, 54],
        pages: [83, 98],
        timeOfDay: "DUSK",
        places: [
          "EXT. DEPARTMENT STORE - ROOF GARDEN",
          "EXT. DEPARTMENT STORE - LOADING BAY",
        ],
        cast: ["LORNA", "NAT", "FRIEDA", "OBI", "MR. ASHWORTH"],
        summary:
          "They carry the garden down the stairs, bed by bed, into the street, and the whole block comes out to take a plant home.",
      },
    ],
  },
  {
    key: "heavy/h39/script",
    project: "the-archivist",
    format: "screenplay",
    cast: [
      { cue: "ROWENA", name: "Rowena Clague", called: "Rowena" },
      { cue: "MARJORIE", name: "Marjorie Clague", called: "Marjorie" },
      { cue: "OTTO", name: "Otto Brisk", called: "Otto" },
      { cue: "MR. PIM", name: "Godfrey Pim", called: "Mr. Pim" },
      { cue: "EFFIE", name: "Effie Dunn", called: "Effie" },
    ],
    places: [
      { heading: "INT. CITY ARCHIVE - STRONG ROOM", spoken: "the strong room" },
      {
        heading: "INT. CITY ARCHIVE - READING ROOM",
        spoken: "the archive reading room",
      },
      { heading: "INT. MARJORIE'S BUNGALOW", spoken: "the bungalow" },
      { heading: "INT. REGISTER OFFICE", spoken: "the register office" },
      { heading: "INT. CARE HOME - DAY ROOM", spoken: "the day room" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "DAY",
        places: ["INT. CITY ARCHIVE - STRONG ROOM"],
        cast: ["ROWENA", "OTTO"],
        summary:
          "Rowena, the city archivist, finds her own birth certificate filed a year before she was born, in a box nobody has opened since.",
      },
      {
        scenes: [10, 19],
        pages: [17, 34],
        timeOfDay: "DAY",
        places: ["INT. MARJORIE'S BUNGALOW"],
        cast: ["ROWENA", "MARJORIE"],
        summary:
          "Marjorie says it is a clerk's mistake and changes the subject to the guttering; she has never once changed the subject before.",
      },
      {
        scenes: [20, 29],
        pages: [34, 51],
        timeOfDay: "DAY",
        places: ["INT. REGISTER OFFICE"],
        cast: ["MR. PIM", "ROWENA"],
        summary:
          "Mr. Pim at the register office says a mistake like that is not possible, then finds two more in the same ledger.",
      },
      {
        scenes: [30, 39],
        pages: [51, 68],
        timeOfDay: "NIGHT",
        places: ["INT. CITY ARCHIVE - READING ROOM"],
        cast: ["OTTO", "ROWENA"],
        summary:
          "Otto helps her search the year's records after hours; every child born at one hospital that month was entered a year early.",
      },
      {
        scenes: [40, 48],
        pages: [68, 84],
        timeOfDay: "DAY",
        places: ["INT. CARE HOME - DAY ROOM"],
        cast: ["EFFIE", "ROWENA"],
        summary:
          "Effie, the retired midwife, remembers the new clerk who started the ward's register on the wrong year's page and was too frightened to say.",
      },
      {
        scenes: [49, 55],
        pages: [84, 102],
        timeOfDay: "DAY",
        places: ["INT. MARJORIE'S BUNGALOW", "INT. CITY ARCHIVE - STRONG ROOM"],
        cast: ["ROWENA", "MARJORIE", "OTTO"],
        summary:
          "Marjorie admits she always knew and kept the extra year as a gift; Rowena files the correction, and keeps the old certificate too.",
      },
    ],
  },
  {
    key: "heavy/h40/script",
    project: "the-glassblower",
    format: "screenplay",
    cast: [
      { cue: "MAGDA", name: "Magda Fairlie", called: "Magda" },
      { cue: "JEM", name: "Jem Hollister", called: "Jem" },
      { cue: "RHODA", name: "Rhoda Bellamy", called: "Rhoda" },
      { cue: "DR. ASARE", name: "Kwabena Asare", called: "Dr. Asare" },
      { cue: "LEWIN", name: "Lewin Fairlie", called: "Lewin" },
    ],
    places: [
      { heading: "INT. EYE CLINIC", spoken: "the eye clinic" },
      {
        heading: "INT. TOLLE EXCHANGE LIBRARY - READING ROOM",
        spoken: "the new reading room",
      },
      { heading: "INT. GLASS STUDIO - FURNACE", spoken: "the studio furnace" },
      { heading: "EXT. GLASS STUDIO - YARD", spoken: "the studio yard" },
      { heading: "INT. MAGDA'S FLAT", spoken: "the flat above the studio" },
    ],
    names: [],
    beats: [
      {
        scenes: [1, 9],
        pages: [1, 17],
        timeOfDay: "DAY",
        places: ["INT. EYE CLINIC"],
        cast: ["DR. ASARE", "MAGDA"],
        summary:
          "Dr. Asare tells Magda her sight will go within the year; that afternoon she bids for the window of the new Tolle Exchange library.",
      },
      {
        scenes: [10, 19],
        pages: [17, 34],
        timeOfDay: "DAY",
        places: ["INT. TOLLE EXCHANGE LIBRARY - READING ROOM"],
        cast: ["RHODA", "MAGDA"],
        summary:
          "Rhoda, the architect, shows her the empty frame, forty feet of it, facing the river; Magda measures it with her hands.",
      },
      {
        scenes: [20, 28],
        pages: [34, 50],
        timeOfDay: "DAY",
        places: ["INT. GLASS STUDIO - FURNACE"],
        cast: ["MAGDA", "JEM"],
        summary:
          "She takes Jem as her apprentice and teaches him to blow glass by sound and by the heat on his face, not by looking.",
      },
      {
        scenes: [29, 38],
        pages: [50, 67],
        timeOfDay: "NIGHT",
        places: ["INT. MAGDA'S FLAT"],
        cast: ["LEWIN", "MAGDA"],
        summary:
          "Lewin, her son, wants her to stop and come and live with him; she has him describe every colour of the river at night.",
      },
      {
        scenes: [39, 47],
        pages: [67, 83],
        timeOfDay: "DAY",
        places: ["EXT. GLASS STUDIO - YARD", "INT. GLASS STUDIO - FURNACE"],
        cast: ["MAGDA", "JEM", "RHODA"],
        summary:
          "A whole panel cracks as it cools; Jem blows the replacement alone while Magda tells him, piece by piece, what she can no longer see.",
      },
      {
        scenes: [48, 54],
        pages: [83, 94],
        timeOfDay: "DAY",
        places: ["INT. TOLLE EXCHANGE LIBRARY - READING ROOM"],
        cast: ["MAGDA", "JEM", "RHODA", "LEWIN", "DR. ASARE"],
        summary:
          "The window goes in; Magda stands in the reading room and knows it is right by the warmth of the light on her hands.",
      },
    ],
  },
];

const ACTION: readonly string[] = [
  "{cast:0} sets two cups on the table and fills only one.",
  "{cast:0} reads the note twice, folds it small and pockets it.",
  "Rain runs off the roof of {place} in a steady sheet.",
  "{cast:0} waits by the door with a coat over one arm.",
  "{cast:1} comes in without knocking and stands dripping on the mat.",
  "{cast:0} counts the coins on the counter, then counts them again.",
  "The light in {place} flickers, dims and settles.",
  "{cast:0} looks at {cast:1} for a long moment and says nothing.",
  "{cast:0} pulls out a chair for {cast:1}, who stays standing.",
  "A clock somewhere in {place} strikes the hour, a minute late.",
  "{cast:0} wipes the misted window with a sleeve and peers out.",
  "{cast:1} drops a heavy bag on the floor and sits on it.",
  "{cast:0} finds a pencil behind one ear and a second behind the other.",
  "{cast:0} hums a tune that nobody else in the room knows.",
  "The door of {place} sticks, then gives all at once.",
  "{cast:0} breaks the last biscuit in two and offers {cast:1} the smaller half.",
  "{cast:0} stands very still in the doorway, listening to the house.",
  "{cast:1} laughs once and turns it into a cough.",
  "{cast:0} turns the key in the lock and leaves it there.",
  "{cast:0} stacks the chairs against the wall, one by one, too loudly.",
  "Wind pushes at every window of {place}.",
  "{cast:0} writes a telephone number on the back of a hand.",
  "{cast:1} reaches the top of the stairs out of breath and pretends not to be.",
  "{cast:0} takes off one boot and shakes a stone out of it.",
  "{cast:0} spreads a map across the table and weighs the corners down with mugs.",
  "The kettle in {place} begins to sing and nobody moves.",
  "{cast:0} squints at the small print on a form and gives up.",
  "{cast:1} hangs back in the doorway with both hands in pockets.",
  "{cast:0} straightens a picture frame that was already straight.",
  "{cast:0} sweeps the floor around {cast:1}'s feet without comment.",
  "Somewhere below {place}, a dog barks twice and stops.",
  "{cast:0} rolls up both sleeves and gets to work.",
  "{cast:1} holds out a hand for the keys and waits.",
  "{cast:0} perches on the edge of a desk, swinging one foot.",
  "{cast:1} checks a wristwatch against the clock on the wall.",
  "Dust hangs in the long light across {place}.",
  "{cast:0} picks up a dropped glove from the step and keeps it.",
  "{cast:0} takes a deep breath at the door and knocks.",
  "{cast:1} opens the door in a dressing gown and odd socks.",
  "{cast:0} shakes the rain off an umbrella over the step.",
  "{cast:0} steps around one puddle and straight into another.",
  "{cast:1} winces at the scrape of a chair.",
  "The floorboards of {place} creak under every step.",
  "{cast:0} lights a lamp and turns the wick down low.",
  "{cast:0} reads from a list aloud, ticking off each line with a thumbnail.",
  "{cast:1} takes the list away and reads it again in silence.",
  "{cast:0} sits down hard on the bottom stair.",
  "A lorry goes past outside {place} and the glasses rattle on the shelf.",
  "{cast:0} unwraps a sandwich, considers it and wraps it up again.",
  "{cast:1} watches everything from the far side of the room.",
  "{cast:0} buttons a coat right up to the chin.",
  "{cast:0} leans on the railing and looks a long way down.",
  "{cast:0} sets an alarm clock and turns it face down on the shelf.",
  "Someone has left a radio playing softly in {place}.",
  "{cast:0} switches off the radio, and {cast:1} switches it back on.",
  "{cast:0} tips cold tea into the nearest plant pot.",
  "{cast:0} turns a page and frowns at what is written on the next.",
  "{cast:1} slides down the wall and sits on the floor.",
  "Nobody has swept {place} in weeks.",
  "{cast:0} pulls the curtain aside an inch and lets it fall.",
  "{cast:0} drags a heavy box across the floor by one corner.",
  "{cast:1} lifts the other end of the box without being asked.",
  "{cast:0} puts on reading glasses and peers over the top of them.",
  "{cast:0} tears a page out of a notebook and passes it across.",
  "{cast:1} reads the torn page and laughs in spite of everything.",
  "Every light in {place} goes out at once.",
  "{cast:0} strikes a match and holds it up to see by.",
  "{cast:1} finds the fuse box in the dark by touch.",
  "{cast:0} stamps the mud off both boots on the step.",
  "{cast:0} warms both hands at the stove.",
  "{cast:1} drags a stool up beside the stove and sits close.",
  "Steam rises from a pan somebody forgot in {place}.",
  "{cast:0} wraps a scarf twice round {cast:1}'s neck.",
  "{cast:0} looks up at the sky and holds out a palm for rain.",
  "{cast:1} opens an umbrella over the two of them.",
  "{cast:0} follows the timetable on the wall with one finger.",
  "{cast:0} turns out every pocket and finds only a button.",
  "{cast:1} produces the missing ticket from inside a hat.",
  "The windows of {place} are fogged from the inside.",
  "{cast:0} draws a face in the fog on the glass and rubs it out.",
  "{cast:0} pins a photograph to the board and steps back to look.",
  "{cast:1} moves the pin a quarter inch to the left.",
  "Pigeons scatter from the ledge above {place}.",
  "{cast:0} sharpens a pencil with a kitchen knife.",
  "{cast:0} sniffs the milk and pulls a face.",
  "{cast:1} drinks the sour milk anyway.",
  "{cast:0} closes the ledger with a thump that makes everyone look up.",
  "Footsteps cross the floor above {place} and stop.",
  "{cast:0} stares up at the ceiling, waiting for the footsteps to go on.",
  "{cast:1} holds up a hand for quiet.",
  "{cast:0} ties a knot, tests it with a tug and ties another.",
  "{cast:0} sits up very straight when the door opens.",
  "{cast:1} brings in a tray of cups that do not match.",
  "A draught finds its way under the door of {place}.",
  "{cast:0} lays a rolled towel along the bottom of the door.",
  "{cast:0} reads the same line of the letter three times.",
  "{cast:1} leans in close to read the letter too.",
  "{cast:0} snaps the book shut before {cast:1} can see.",
  "The telephone in {place} rings and rings.",
  "{cast:0} lets the telephone ring until it stops.",
  "{cast:1} picks up the receiver, listens and puts it down without a word.",
  "{cast:0} hangs a wet coat over the back of a chair to steam.",
  "{cast:0} looks around {place} as if for the first time.",
  "{cast:1} trips on the rug and catches the table just in time.",
  "{cast:0} pretends not to have seen {cast:1} trip.",
  "{cast:0} folds a paper boat out of the receipt.",
  "{cast:0} sets the paper boat on the windowsill to dry.",
  "Outside {place}, the street lamps come on one at a time.",
  "{cast:0} pours a glass of water and drinks it standing at the sink.",
  "{cast:1} holds out an empty glass to be filled.",
  "{cast:0} tucks a loose thread back into a cuff.",
  "{cast:0} sits at the piano with both hands folded and does not play.",
  "{cast:1} lifts the piano lid and plays a single note.",
  "The single note hangs in the air of {place}.",
  "{cast:0} rattles the handle of a locked drawer.",
  "{cast:1} slides a hairpin across the table.",
  "{cast:0} works the drawer open with the hairpin, slowly.",
  "{cast:0} lays out three envelopes in a row on the blanket.",
  "{cast:1} picks the middle envelope without hesitating.",
  "Cold air comes in with {cast:0} and stays after the door shuts.",
  "{cast:0} stands at the sink looking at nothing in particular.",
  "{cast:1} dries a plate that is already dry.",
  "{cast:0} props the door open with a boot.",
  "{cast:0} carries in an armful of firewood and drops half of it.",
  "{cast:1} gathers up the dropped logs.",
  "A cat walks along the back of the sofa in {place}.",
  "{cast:0} lifts the cat off the papers and sets it down on the floor.",
  "{cast:0} reads a letter by the light of the open fridge.",
  "{cast:1} switches on the overhead light, and {cast:0} blinks.",
  "{cast:0} lines up the pencils on the desk by length.",
  "{cast:1} knocks one pencil out of line on purpose.",
  "The heating in {place} clanks and comes to life.",
  "{cast:0} sits on the radiator until it gets too hot to bear.",
  "{cast:1} hides a smile behind a mug of tea.",
  "{cast:0} scrapes the burnt edge off a slice of toast and butters it anyway.",
  "The rain stops, and {place} goes suddenly quiet.",
  "{cast:0} opens the window to the smell of wet stone.",
  "{cast:1} closes the window again without a word.",
  "{cast:0} sorts the post into two piles, then three.",
  "{cast:1} drops one more letter on the smallest pile.",
  "{cast:0} sits back and rubs both eyes with the heels of the hands.",
  "{cast:0} checks the back door twice before bed.",
  "{cast:1} leaves muddy prints all the way across the clean floor.",
  "{cast:0} follows the muddy prints with a mop.",
  "A bell rings somewhere beyond {place}.",
  "{cast:0} counts the steps out loud on the way up.",
  "{cast:1} overtakes on the last step.",
  "{cast:0} pins up a notice and smooths the corners flat.",
  "{cast:1} reads the notice and takes it down.",
  "The smell of frying drifts into {place}.",
  "{cast:0} pauses at the top of the stairs with a hand on the rail.",
  "{cast:0} keeps a finger in the book to mark the place.",
  "{cast:1} takes the book and loses the place.",
  "{cast:0} empties a pocket of string, a stub of candle and a key.",
  "{cast:1} picks out the key and turns it over.",
  "A shaft of sun comes through the high window of {place}.",
  "{cast:0} steps into the patch of sun and closes both eyes.",
  "{cast:0} tightens a loose screw with a coin.",
  "{cast:1} holds the torch steady and gives advice nobody wants.",
  "{cast:0} blows the dust off the top of a box and coughs.",
  "{cast:1} lifts the lid of the box very carefully.",
  "There is a box of old photographs of {place} under the bed.",
  "{cast:0} picks out one photograph and holds it to the light.",
  "{cast:1} takes the photograph and puts it face down.",
  "{cast:0} scribbles a sum on a paper bag and frowns at the answer.",
  "{cast:1} does the same sum in pencil and gets a different one.",
  "Snow is falling past the window of {place}.",
  "{cast:0} nudges the door shut with a hip.",
  "{cast:0} balances a cup on a saucer on a book on a knee.",
  "{cast:1} rescues the cup just before it goes.",
  "{cast:0} tries the door handle, gently, then harder.",
  "{cast:1} reaches past and pushes the door, which was never locked.",
  "The stairs of {place} are steeper than they look.",
  "{cast:0} takes the stairs two at a time and regrets it.",
  "{cast:0} stirs a cup of tea for far longer than it needs.",
  "{cast:1} taps the table, waiting for an answer.",
  "{cast:0} gives a shrug that answers nothing.",
  "A gull lands on the sill outside {place} and stares in.",
  "{cast:0} stares back at the gull until it leaves.",
  "{cast:0} draws the bolt on the door and checks it.",
  "{cast:1} leans against the wall outside, breathing in the cold.",
  "{cast:0} empties the teapot and starts again from the beginning.",
  "The fire in {place} has burned down to a red glow.",
  "{cast:0} puts another log on the fire and pokes it into life.",
  "{cast:1} falls asleep in the armchair, mid-sentence.",
  "{cast:0} drapes a blanket over {cast:1} and turns the lamp down.",
  "{cast:0} writes the date at the top of a clean page.",
  "{cast:0} crosses out a word and writes the same word again.",
  "{cast:1} reads over the shoulder of {cast:0} and says nothing.",
  "Somebody has chalked a name on the wall of {place}.",
  "{cast:0} rubs at the chalk with a wet thumb.",
  "{cast:0} sets out four plates, then takes one away.",
  "{cast:1} puts the fourth plate back.",
  "The clock in {place} has stopped at twenty past three.",
  "{cast:0} winds the stopped clock and sets it by a wristwatch.",
  "{cast:1} arrives with flowers wrapped in newspaper.",
  "{cast:0} has nothing to put the flowers in but a milk bottle.",
  "{cast:0} rehearses a sentence under the breath, twice.",
  "{cast:1} opens the door before the sentence is ready.",
  "Every chair in {place} is taken but one.",
  "{cast:0} takes the last chair and gives it up at once.",
  "{cast:0} mops a spill with a sleeve.",
  "{cast:1} hands over a clean handkerchief, too late.",
  "{cast:0} watches the road from the window for a car that does not come.",
  "The bus pulls away from the stop outside {place}.",
  "{cast:0} runs for the bus and misses it by a yard.",
  "{cast:1} catches up, out of breath, laughing.",
  "{cast:0} sits on a bench with a paper bag of chips.",
  "{cast:1} steals a chip and gets a look for it.",
  "A string of bunting has come down across {place}.",
  "{cast:0} climbs a stepladder to put the bunting back.",
  "{cast:1} holds the stepladder and looks the other way.",
  "{cast:0} blows on cold fingers and gets on with it.",
  "{cast:0} fishes a coin out of the gap between the floorboards.",
  "Nothing in {place} has been moved since the last time.",
  "{cast:0} runs a finger along a shelf and inspects the dust.",
  "{cast:1} pretends to be very interested in the ceiling.",
  "{cast:0} pulls a face in the mirror and straightens up.",
  "{cast:1} knocks on the open door, out of politeness.",
  "{cast:0} beckons {cast:1} in with two fingers.",
  "The long table in {place} is covered in paper.",
  "{cast:0} clears a space on the table with one sweep of an arm.",
  "{cast:1} catches the cup that goes over the edge.",
  "{cast:0} rubs a stiff neck and looks at the clock.",
  "{cast:0} puts the kettle on for the third time.",
  "{cast:1} sits on the arm of a chair, ready to leave and not leaving.",
  "A ladder leans against the outside wall of {place}.",
  "{cast:0} climbs the ladder with a bucket in one hand.",
  "{cast:1} shouts up a warning that comes too late.",
  "{cast:0} gets down from the ladder, soaked.",
  "{cast:0} empties a shoe of water and puts it back on.",
  "The gate of {place} swings in the wind.",
  "{cast:0} ties the gate shut with a length of string.",
  "{cast:1} undoes the string to get through.",
  "{cast:0} holds a letter up to the window to see through the envelope.",
  "{cast:1} takes the envelope and opens it like a grown-up.",
  "Somebody is singing badly in the next room of {place}.",
  "{cast:0} joins in with the singing, worse.",
  "{cast:0} folds a blanket into a perfect square.",
  "{cast:1} sits down on the folded blanket.",
  "{cast:0} peels an apple in one long curl.",
  "{cast:1} eats the apple before {cast:0} can.",
  "The sign above {place} has lost two of its letters.",
  "{cast:0} squares up a pile of papers by knocking them on the desk.",
  "{cast:1} drops the whole pile, and it fans across the floor.",
  "{cast:0} kneels to gather the papers in order.",
  "{cast:0} rings a bell on the counter and waits.",
  "{cast:1} comes through from the back, chewing.",
  "A smell of paint hangs about {place}.",
  "{cast:0} opens a tin of paint and stirs it with a stick.",
  "{cast:1} paints one stripe on the wall and stands back.",
  "{cast:0} picks a fly out of the wet paint.",
  "{cast:0} turns up a collar against the wind.",
  "{cast:1} walks into the wind with eyes shut.",
  "The path to {place} is lined with puddles.",
  "{cast:0} hops from stone to stone to keep dry.",
  "{cast:1} walks straight through every puddle.",
  "{cast:0} picks a leaf off {cast:1}'s sleeve.",
  "{cast:0} rests a forehead against the cool glass.",
  "{cast:1} slides a mug across the table without a word.",
  "The bulb in {place} hums.",
  "{cast:0} taps the humming bulb, and it goes out.",
  "{cast:0} lays a hand flat on the door before opening it.",
  "{cast:1} counts silently, lips moving.",
  "{cast:0} pulls on gloves one finger at a time.",
  "The big doors of {place} open with a groan.",
  "{cast:0} switches on a torch and sweeps it across the dark.",
  "{cast:1} jumps at a shadow and laughs at the jump.",
  "{cast:0} sets a candle in a saucer and lights it.",
  "{cast:0} writes a list on the steamed-up mirror.",
  "{cast:1} adds one item to the list with a fingertip.",
  "Someone has stacked the chairs of {place} on the tables.",
  "{cast:0} lifts down one chair and sits on it, alone.",
  "{cast:0} spins a coin on the table and watches it fall.",
  "{cast:1} calls heads before it lands.",
  "{cast:0} pins a loose hem with a safety pin.",
  "{cast:1} brings over a sewing tin and a disapproving look.",
  "The radiator in {place} knocks like someone wanting to come in.",
  "{cast:0} opens a parcel with great care and saves the string.",
  "{cast:1} reads the label on the parcel twice.",
  "{cast:0} sets a jam jar of wildflowers on the sill.",
  "A train goes by beyond {place}, and the cups chatter.",
  "{cast:0} pauses with a hand on the light switch.",
  "{cast:1} says goodnight from the dark and is gone.",
  "{cast:0} pulls the blinds and shuts out the street.",
  "{cast:0} eats standing up, straight from the pan.",
  "{cast:1} sets the table anyway, properly, for two.",
  "The cupboards of {place} hold one tin of beans and a candle.",
  "{cast:0} opens the tin of beans with a penknife.",
  "{cast:1} laughs and fetches the opener from the drawer.",
  "{cast:0} rubs a thumb along the edge of an old scar.",
  "{cast:0} sleeps sitting up, head against the window.",
  "{cast:1} slips out without waking anyone.",
  "Morning light comes slowly into {place}.",
  "{cast:0} wakes with a start and a crick in the neck.",
  "{cast:1} has left a note propped against the kettle.",
  "{cast:0} reads the note and smiles despite the hour.",
  "{cast:0} puts on a coat and goes out into the early street.",
  "{cast:1} watches from the window until {cast:0} turns the corner.",
  "Behind them, the door of {place} closes softly.",
];

const DIALOGUE: readonly SharedLine[] = [
  {
    speaker: 0,
    intent: "ask",
    text: "{cast:1}, have you eaten anything today?",
  },
  { speaker: 0, intent: "ask", text: "Where did you put the keys, {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Has anyone been down to {place} since this morning?",
  },
  { speaker: 0, intent: "ask", text: "Is that the time already, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "Why is the door of {place} open?" },
  {
    speaker: null,
    intent: "ask",
    text: "Who left a light burning at {place}?",
  },
  { speaker: 0, intent: "ask", text: "{cast:1}, can you hear that?" },
  { speaker: 0, intent: "ask", text: "What did you say to {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "How long have we been waiting at {place}?",
  },
  { speaker: 0, intent: "ask", text: "Did you lock up {place} last night?" },
  {
    speaker: 0,
    intent: "ask",
    text: "{cast:1}, are you going to finish that?",
  },
  {
    speaker: null,
    intent: "ask",
    text: "Does anybody know the way back from {place}?",
  },
  { speaker: 0, intent: "ask", text: "When did you last sleep, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "Is there any tea left in {place}?" },
  { speaker: null, intent: "ask", text: "Who is going to sweep out {place}?" },
  { speaker: 0, intent: "ask", text: "{cast:1}, what are you looking at?" },
  { speaker: 0, intent: "ask", text: "Have you been in {place} all night?" },
  {
    speaker: null,
    intent: "ask",
    text: "Is it safe to cross {place} after dark?",
  },
  { speaker: 0, intent: "ask", text: "Are you cold, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "Whose coat is this, {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "What would anyone want with {place}?",
  },
  { speaker: 0, intent: "ask", text: "Why are we whispering in {place}?" },
  {
    speaker: 0,
    intent: "ask",
    text: "{cast:1}, do you want the good news first?",
  },
  { speaker: null, intent: "ask", text: "Did they say when {place} opens?" },
  { speaker: 0, intent: "ask", text: "How did you get into {place}?" },
  {
    speaker: 0,
    intent: "ask",
    text: "Will you be all right on your own, {cast:1}?",
  },
  { speaker: null, intent: "ask", text: "Are we going to {place} or not?" },
  { speaker: 0, intent: "ask", text: "What time do they close {place}?" },
  { speaker: 0, intent: "ask", text: "{cast:1}, where were you?" },
  {
    speaker: null,
    intent: "ask",
    text: "Has anyone thought to look round {place}?",
  },
  { speaker: 0, intent: "ask", text: "Do you trust me, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "Who else knows about {place}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Why does everybody end up at {place}?",
  },
  { speaker: 0, intent: "ask", text: "Can you carry the other end, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "Is it always this quiet in {place}?" },
  { speaker: null, intent: "ask", text: "What was that noise from {place}?" },
  { speaker: 0, intent: "ask", text: "{cast:1}, have you got a pen?" },
  { speaker: 0, intent: "ask", text: "How much do we owe {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Where do we go after {place}?",
  },
  { speaker: 0, intent: "ask", text: "Did you hear the forecast, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "Who left the lights on in {place}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Will {place} still be there in the morning?",
  },
  { speaker: 0, intent: "ask", text: "{cast:1}, what are we doing here?" },
  { speaker: 0, intent: "ask", text: "Is this yours, {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "When did we last have a quiet hour at {place}?",
  },
  {
    speaker: 0,
    intent: "ask",
    text: "Have you ever been up to {place} at night?",
  },
  { speaker: 0, intent: "ask", text: "What do you need, {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Does anyone know where the spare key to {place} is kept?",
  },
  { speaker: 0, intent: "ask", text: "{cast:1}, why didn't you tell me?" },
  { speaker: 0, intent: "ask", text: "Are we expected at {place}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Who found {place} in the first place?",
  },
  { speaker: 0, intent: "ask", text: "Are you laughing at me, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "How far is it to {place} from here?" },
  {
    speaker: null,
    intent: "ask",
    text: "Is that someone at {place}, or just the wind?",
  },
  {
    speaker: 0,
    intent: "ask",
    text: "{cast:1}, do you remember the first time?",
  },
  {
    speaker: 0,
    intent: "ask",
    text: "Could we talk somewhere other than {place}?",
  },
  { speaker: null, intent: "ask", text: "What has happened at {place} now?" },
  { speaker: 0, intent: "ask", text: "Is it true, {cast:1}?" },
  { speaker: 0, intent: "ask", text: "Why would anyone put {place} up here?" },
  {
    speaker: null,
    intent: "ask",
    text: "Did anyone sign for the boxes at {place}?",
  },
  { speaker: 0, intent: "ask", text: "{cast:1}, is this a good idea?" },
  { speaker: 0, intent: "ask", text: "Who's paying for all this, {cast:1}?" },
  { speaker: null, intent: "ask", text: "Do we wait at {place}, or go on?" },
  { speaker: 0, intent: "ask", text: "What happened in {place}?" },
  { speaker: 0, intent: "ask", text: "Will you come with me, {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Has {place} ever let us down before?",
  },
  { speaker: 0, intent: "ask", text: "{cast:1}, what's that noise?" },
  { speaker: 0, intent: "ask", text: "Can I see {place} before we go?" },
  {
    speaker: null,
    intent: "ask",
    text: "How does anybody work at {place} with all that noise?",
  },
  {
    speaker: 0,
    intent: "ask",
    text: "Is anybody ever going to fix the step at {place}?",
  },
  { speaker: 0, intent: "ask", text: "Did you mean it, {cast:1}?" },
  {
    speaker: null,
    intent: "ask",
    text: "Why is everyone so cheerful about {place}?",
  },
  { speaker: 0, intent: "ask", text: "{cast:1}, what would you do?" },
  { speaker: 0, intent: "ask", text: "Are you staying the night at {place}?" },
  {
    speaker: null,
    intent: "ask",
    text: "What are we going to say when we get to {place}?",
  },
  { speaker: 0, intent: "answer", text: "Not yet, {cast:1}. Give it an hour." },
  {
    speaker: 0,
    intent: "answer",
    text: "In the drawer, {cast:1}, where they always are.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "No, and nobody's been near {place} either.",
  },
  { speaker: 0, intent: "answer", text: "Since first light, {cast:1}." },
  { speaker: 0, intent: "answer", text: "Yes, I locked {place} myself." },
  {
    speaker: null,
    intent: "answer",
    text: "Someone from {place} told me, more or less.",
  },
  { speaker: 0, intent: "answer", text: "Only the wind, {cast:1}." },
  {
    speaker: 0,
    intent: "answer",
    text: "Nothing {cast:1} didn't already know.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "Long enough to know {place} by heart.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Twice, and {place} was empty both times.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "You have it, {cast:1}. I've had plenty.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "We know the way. We always find {place} in the end.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "I'll sleep when it's done, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "There's half a pot in {place}, stewed.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "I'll sweep out {place}. It ought to be me.",
  },
  { speaker: 0, intent: "answer", text: "The road, {cast:1}. Just the road." },
  {
    speaker: 0,
    intent: "answer",
    text: "Most of it. It's warmer in {place} than at home.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "It's safe. I'd stake the house on {place}.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "I'm frozen, {cast:1}, since you ask.",
  },
  { speaker: 0, intent: "answer", text: "It's mine. {cast:1} lent it me." },
  {
    speaker: null,
    intent: "answer",
    text: "Nobody sensible would go near {place} at this hour.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Because the walls in {place} are thin.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "There isn't any good news, {cast:1}.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "Tonight, they said, when {place} opens. Or tomorrow.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "The back door of {place} never shuts properly.",
  },
  { speaker: 0, intent: "answer", text: "I'll manage, {cast:1}. I always do." },
  {
    speaker: null,
    intent: "answer",
    text: "We're going to {place}. Slowly, but going.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "They never close {place}. That's the trouble.",
  },
  { speaker: 0, intent: "answer", text: "Out, {cast:1}. Walking. Thinking." },
  {
    speaker: null,
    intent: "answer",
    text: "Not in so many words, but {place} has been on everyone's mind.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "With my life, {cast:1}. Don't make me prove it.",
  },
  { speaker: 0, intent: "answer", text: "Nobody but us knows about {place}." },
  {
    speaker: null,
    intent: "answer",
    text: "Because {place} is the only warm spot for miles.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "I've got it, {cast:1}. Lift on three.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "It's always this quiet in {place} before it isn't.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "Something from {place}, I think. It's stopped now.",
  },
  { speaker: 0, intent: "answer", text: "Here, {cast:1}. Bring it back." },
  { speaker: 0, intent: "answer", text: "More than we've got, {cast:1}." },
  {
    speaker: null,
    intent: "answer",
    text: "After {place}, we go home.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Rain by nine, {cast:1}, and worse after.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "I left them on. I don't like {place} in the dark.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "It'll be there. Nothing ever moves {place}.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Waiting, {cast:1}. Same as everyone.",
  },
  { speaker: 0, intent: "answer", text: "It was, {cast:1}. Now it's yours." },
  {
    speaker: null,
    intent: "answer",
    text: "They said Thursday for {place}, but that means Friday.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Once, years ago. I didn't like {place} at night.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "A minute's peace, {cast:1}, and a chair.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "Under the mat at {place}, where it always is.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Because you'd have stopped me, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "We're expected. They've had {place} ready since six.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "Nobody found {place}. It found us.",
  },
  { speaker: 0, intent: "answer", text: "With you, {cast:1}, never at you." },
  {
    speaker: 0,
    intent: "answer",
    text: "An hour on foot to {place}, if the path holds.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "It's only the wind. It always blows like that at {place}.",
  },
  { speaker: 0, intent: "answer", text: "Every minute of it, {cast:1}." },
  {
    speaker: 0,
    intent: "answer",
    text: "Anywhere you like. The walls in {place} have ears.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "Nothing yet. We'll know more at {place}.",
  },
  { speaker: 0, intent: "answer", text: "Every word of it, {cast:1}." },
  {
    speaker: 0,
    intent: "answer",
    text: "Someone stubborn built {place}. Someone like you.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "I signed this morning, at {place}, in ink.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "It's the only idea we've got, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "We are, {cast:1}. Out of our own pockets.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "We wait. Someone will come to {place} for us.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Nothing happened in {place}. That's the point.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "I'll come, {cast:1}, but I'm not happy about it.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "Once. People at {place} still talk about it.",
  },
  { speaker: 0, intent: "answer", text: "The pipes, {cast:1}. They do that." },
  { speaker: 0, intent: "answer", text: "You can see {place} on the way out." },
  {
    speaker: null,
    intent: "answer",
    text: "You stop hearing it after a week at {place}.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "Not this year. {cast:1} says it's on the list.",
  },
  { speaker: 0, intent: "answer", text: "I meant every word, {cast:1}." },
  {
    speaker: null,
    intent: "answer",
    text: "Everyone smiles at {place} when it's going badly.",
  },
  {
    speaker: 0,
    intent: "answer",
    text: "The same as you, {cast:1}, only sooner.",
  },
  { speaker: 0, intent: "answer", text: "If {place} will have me, yes." },
  {
    speaker: null,
    intent: "answer",
    text: "We say we got lost on the way to {place}, and then we say sorry.",
  },
  { speaker: 0, intent: "answer", text: "Yes, {cast:1}. I checked twice." },
  {
    speaker: 0,
    intent: "answer",
    text: "No. Somebody had locked {place} before I got there.",
  },
  {
    speaker: null,
    intent: "answer",
    text: "We were told to wait at {place}, so we wait.",
  },
  { speaker: 0, intent: "answer", text: "Ask me tomorrow, {cast:1}." },
  { speaker: 0, intent: "answer", text: "Right where you left it, {cast:1}." },
  {
    speaker: 0,
    intent: "instruct",
    text: "Sit down, {cast:1}, before you fall down.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "Hold this, {cast:1}, and don't let go.",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Go and look round {place}. Now, please.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "Shut the door of {place} behind you.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "{cast:1}, stop talking and listen.",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Tell them we'll be late to {place}.",
  },
  { speaker: 0, intent: "instruct", text: "Put the kettle on, {cast:1}." },
  { speaker: 0, intent: "instruct", text: "Keep your voice down in {place}." },
  { speaker: null, intent: "instruct", text: "Let's finish at {place} first." },
  { speaker: 0, intent: "instruct", text: "{cast:1}, take the other end." },
  { speaker: 0, intent: "instruct", text: "Wait for me at {place}." },
  { speaker: null, intent: "instruct", text: "Leave the keys at {place}." },
  { speaker: 0, intent: "instruct", text: "Take a slow breath, {cast:1}." },
  {
    speaker: 0,
    intent: "instruct",
    text: "Clear the table in {place}, would you?",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Don't say a word about {place}.",
  },
  { speaker: 0, intent: "instruct", text: "{cast:1}, write this down." },
  { speaker: 0, intent: "instruct", text: "Meet me outside {place} at six." },
  { speaker: null, intent: "instruct", text: "Don't drag {place} into this." },
  { speaker: 0, intent: "instruct", text: "Look at me, {cast:1}." },
  {
    speaker: 0,
    intent: "instruct",
    text: "Bring a torch. There are no lights in {place}.",
  },
  { speaker: null, intent: "instruct", text: "Ask at {place}. Don't ask me." },
  {
    speaker: 0,
    intent: "instruct",
    text: "{cast:1}, go home and get some sleep.",
  },
  { speaker: 0, intent: "instruct", text: "Lock {place} up when you leave." },
  {
    speaker: null,
    intent: "instruct",
    text: "Help me carry the boxes to {place}.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "Count to ten, {cast:1}, then come in.",
  },
  { speaker: 0, intent: "instruct", text: "Don't touch anything in {place}." },
  {
    speaker: null,
    intent: "instruct",
    text: "Send word to {place} and say it's off.",
  },
  { speaker: 0, intent: "instruct", text: "{cast:1}, give me your hand." },
  { speaker: 0, intent: "instruct", text: "Walk with me as far as {place}." },
  { speaker: null, intent: "instruct", text: "Fetch a chair from {place}." },
  {
    speaker: 0,
    intent: "instruct",
    text: "Stay where I can see you, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "Open the windows in {place}. It's stifling.",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Wake everyone at {place}. Gently.",
  },
  { speaker: 0, intent: "instruct", text: "{cast:1}, eat something first." },
  {
    speaker: 0,
    intent: "instruct",
    text: "Sweep {place} before they get here.",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Show them the way out of {place}.",
  },
  { speaker: 0, intent: "instruct", text: "Leave it with me, {cast:1}." },
  { speaker: 0, intent: "instruct", text: "Wait in {place} till I call." },
  {
    speaker: null,
    intent: "instruct",
    text: "Tell the truth about {place}, for once.",
  },
  { speaker: 0, intent: "instruct", text: "{cast:1}, mind the step." },
  { speaker: 0, intent: "instruct", text: "Take the long way round {place}." },
  {
    speaker: null,
    intent: "instruct",
    text: "Don't let anyone pay at {place}.",
  },
  { speaker: 0, intent: "instruct", text: "Say that again, {cast:1}, slowly." },
  {
    speaker: 0,
    intent: "instruct",
    text: "Put everything back in {place} as you found it.",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Find a coat before we go to {place}.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "{cast:1}, start from the beginning.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "Check {place} once more before we go.",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Let them sleep. We'll see to {place} later.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "Hand me that, {cast:1}. No, the other one.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "Don't go into {place} on your own.",
  },
  {
    speaker: null,
    intent: "instruct",
    text: "Come up from {place} the minute you can.",
  },
  {
    speaker: 0,
    intent: "instruct",
    text: "{cast:1}, smile. It won't kill you.",
  },
  { speaker: 0, intent: "instruct", text: "Keep {place} warm for me." },
  {
    speaker: null,
    intent: "instruct",
    text: "Pack sandwiches for the walk to {place}.",
  },
  { speaker: 0, intent: "instruct", text: "Trust me on this one, {cast:1}." },
  { speaker: 0, intent: "instruct", text: "You lead the way to {place}." },
  { speaker: null, intent: "instruct", text: "Save me a seat at {place}." },
  { speaker: 0, intent: "instruct", text: "Sing it again, {cast:1}." },
  { speaker: 0, intent: "instruct", text: "Turn the lights off in {place}." },
  { speaker: null, intent: "instruct", text: "Thank them at {place} for me." },
  {
    speaker: 0,
    intent: "state",
    text: "I've known you twenty years, {cast:1}, and you've never been on time.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "It smells of wet coats and old soup in {place}.",
  },
  {
    speaker: null,
    intent: "state",
    text: "You were right about {place}. I'll never hear the end of it.",
  },
  { speaker: 0, intent: "state", text: "You look tired, {cast:1}." },
  {
    speaker: 0,
    intent: "state",
    text: "I used to love {place} when it was busy.",
  },
  {
    speaker: null,
    intent: "state",
    text: "There's a plan for {place}. That's what worries me.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I'm not cross, {cast:1}. I'm thinking.",
  },
  { speaker: 0, intent: "state", text: "Nobody comes to {place} any more." },
  {
    speaker: null,
    intent: "state",
    text: "They'll want to hear about {place}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "You've got flour on your nose, {cast:1}.",
  },
  { speaker: 0, intent: "state", text: "This is the best view in {place}." },
  {
    speaker: null,
    intent: "state",
    text: "Nobody says goodbye at {place}. They just go.",
  },
  { speaker: 0, intent: "state", text: "I kept your seat, {cast:1}." },
  { speaker: 0, intent: "state", text: "My father ran {place} before I did." },
  {
    speaker: null,
    intent: "state",
    text: "I'd follow you to {place}. Not quickly, but I would.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "You were brilliant tonight, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I can't stay long in {place}. It makes me sad.",
  },
  { speaker: null, intent: "state", text: "I've never been easy at {place}." },
  { speaker: 0, intent: "state", text: "I'm sorry, {cast:1}. I mean it." },
  { speaker: 0, intent: "state", text: "It's colder in {place} than outside." },
  {
    speaker: null,
    intent: "state",
    text: "The tea at {place} tastes of the pot.",
  },
  { speaker: 0, intent: "state", text: "I've made up my mind, {cast:1}." },
  { speaker: 0, intent: "state", text: "Everything I own is in {place}." },
  {
    speaker: null,
    intent: "state",
    text: "That's the best chair at {place}. Nobody sits in it.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "You don't have to do this alone, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "You haven't changed a thing in {place}.",
  },
  {
    speaker: null,
    intent: "state",
    text: "It's cold at {place}. I'm only saying.",
  },
  { speaker: 0, intent: "state", text: "I almost didn't come, {cast:1}." },
  {
    speaker: 0,
    intent: "state",
    text: "There's a draught in {place} that could cut you in half.",
  },
  {
    speaker: null,
    intent: "state",
    text: "I left a coat at {place} and never saw it again.",
  },
  { speaker: 0, intent: "state", text: "I'm glad it was you, {cast:1}." },
  {
    speaker: 0,
    intent: "state",
    text: "The last time I was in {place}, it rained for a week.",
  },
  {
    speaker: null,
    intent: "state",
    text: "Somebody cried at {place}. Don't tell anyone.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "That's the nicest thing you've ever said, {cast:1}.",
  },
  { speaker: 0, intent: "state", text: "You can't have a picnic in {place}." },
  {
    speaker: null,
    intent: "state",
    text: "It isn't as grim at {place} as people think.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I've had worse days, {cast:1}. Not many.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I'll miss {place} more than I'll say.",
  },
  {
    speaker: null,
    intent: "state",
    text: "There's a short cut past {place}, if you know it.",
  },
  { speaker: 0, intent: "state", text: "You're shivering, {cast:1}." },
  {
    speaker: 0,
    intent: "state",
    text: "I found this in {place}, under the floor.",
  },
  {
    speaker: null,
    intent: "state",
    text: "It's fixed now, at {place}. Don't ask how.",
  },
  { speaker: 0, intent: "state", text: "I don't need rescuing, {cast:1}." },
  { speaker: 0, intent: "state", text: "Someone's been sleeping in {place}." },
  {
    speaker: null,
    intent: "state",
    text: "Everyone laughs at the wrong moments at {place}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "It suits you, {cast:1}. It really does.",
  },
  { speaker: 0, intent: "state", text: "I remember {place} being bigger." },
  {
    speaker: null,
    intent: "state",
    text: "Things always look better from {place}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I've never seen you this quiet, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "The roof of {place} leaks in three places.",
  },
  {
    speaker: null,
    intent: "state",
    text: "Nobody's eaten since we left {place}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I'm proud of you, {cast:1}. There. I've said it.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "This is the only warm room in {place}.",
  },
  {
    speaker: null,
    intent: "state",
    text: "Nobody can sing in {place}, and nobody ever could.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I think you're wrong, {cast:1}, but go on.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "Somebody left a note for you at {place}.",
  },
  {
    speaker: null,
    intent: "state",
    text: "I'll be the last one out of {place}, you watch.",
  },
  { speaker: 0, intent: "state", text: "We used to be friends, {cast:1}." },
  {
    speaker: 0,
    intent: "state",
    text: "Coming back to {place} always feels like the end of something.",
  },
  {
    speaker: null,
    intent: "state",
    text: "Somebody keeps every receipt at {place}. Every one.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "You were right, {cast:1}. Write it down; it won't happen again.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I can hear the sea from {place} at night.",
  },
  {
    speaker: null,
    intent: "state",
    text: "You can hear voices at {place} at night, about nothing.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I don't know how to thank you, {cast:1}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "What {place} needs is a coat of paint and a miracle.",
  },
  {
    speaker: null,
    intent: "state",
    text: "I'd rather walk to {place} than ask for a lift.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I'm not leaving without you, {cast:1}.",
  },
  { speaker: 0, intent: "state", text: "I keep thinking about {place}." },
  {
    speaker: null,
    intent: "state",
    text: "We're late for {place}. We're always late.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "You never change, {cast:1}. Thank goodness.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "Everyone who works in {place} ends up staying.",
  },
  {
    speaker: null,
    intent: "state",
    text: "It's years since {place} was new.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "That's not what I said, {cast:1}, and you know it.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "It's quieter than a church in {place} tonight.",
  },
  {
    speaker: null,
    intent: "state",
    text: "I found this at {place}. I've never let it go.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "It's late, {cast:1}. Everyone's gone home.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "There's room for one more in {place}.",
  },
  {
    speaker: null,
    intent: "state",
    text: "You need the patience of a stone at {place}.",
  },
  { speaker: 0, intent: "state", text: "I'm too old for this, {cast:1}." },
  {
    speaker: 0,
    intent: "state",
    text: "There were people all over {place} once.",
  },
  {
    speaker: null,
    intent: "state",
    text: "Somebody worked at {place} before any of us.",
  },
  { speaker: 0, intent: "state", text: "I'd do it all again, {cast:1}." },
  {
    speaker: 0,
    intent: "state",
    text: "The trouble with {place} is the stairs.",
  },
  {
    speaker: null,
    intent: "state",
    text: "The bravest thing I ever did was go back to {place}.",
  },
  {
    speaker: 0,
    intent: "state",
    text: "I've brought you soup, {cast:1}. Don't argue.",
  },
];

const TAGS: readonly string[] = [
  "if anyone at {place} asks",
  "or so they say at {place}",
  "and everyone at {place} knows it",
  "same as it always is at {place}",
  "whatever they think at {place}",
  "if you ask anyone at {place}",
  "and not a word to {place}",
  "according to everyone at {place}",
  "for the sake of {place}",
  "as they keep saying at {place}",
  "before we get back to {place}",
  "the way it's done at {place}",
  "unless {place} is shut",
  "if {place} lets us",
  "now we're at {place}",
  "while nobody at {place} is looking",
  "and {place} can whistle for it",
  "come what may at {place}",
  "just like they said at {place}",
  "for all anyone at {place} cares",
  "if there's any left at {place}",
  "ask at {place} if you don't believe me",
  "not that anyone at {place} would notice",
  "since we left {place}",
  "thanks to {place}",
  "with the blessing of {place}",
  "round the back of {place}",
  "as sure as {place} stands",
  "if {place} is still standing",
  "same as {place} ever was",
  "this side of {place}",
  "by the clock in {place}",
  "till {place} closes",
  "the minute we're out of {place}",
  "as long as {place} is dry",
  "while we're still in {place}",
  "before anyone at {place} sees",
  "and {place} can like it or not",
  "if nobody at {place} beats us to it",
  "the way they taught me at {place}",
];

const SLOT = /\{cast:(\d)\}|\{place\}/g;

/** Entry `at` of a list, wrapping round, so a film's lines spread over its whole cast and every place. */
function nth<T>(list: readonly T[], at: number): T {
  const item = list[at % list.length];
  if (item === undefined)
    throw new RangeError(
      `a film lists at least one of each, not ${list.length}`,
    );
  return item;
}

/** Entry `at` of a shared list names cast member `at + k` for `{cast:k}`, and place `at`. */
function fill(template: string, film: Film, at: number): string {
  return template.replace(SLOT, (_slot, k: string | undefined) =>
    k === undefined
      ? nth(film.places, at).spoken
      : nth(film.cast, at + Number(k)).called,
  );
}

function guideOf(film: Film): StyleGuide {
  return Object.freeze<StyleGuide>({
    project: film.project,
    format: film.format,
    cast: film.cast.map(({ cue, name }) => ({ cue, name })),
    places: film.places.map((place) => place.heading),
    names: film.names,
    vocabulary: [],
    beats: film.beats.map((beat, index) => ({
      id: `${film.key}#${index + 1}`,
      ...beat,
    })),
    style: STYLE,
    action: ACTION.map((text, at) => fill(text, film, at)),
    dialogue: DIALOGUE.map((line, at) => ({
      speaker:
        line.speaker === null ? null : nth(film.cast, at + line.speaker).cue,
      intent: line.intent,
      text: fill(line.text, film, at),
    })),
    tags: TAGS.map((text, at) => fill(text, film, at)),
    stories: [],
    barks: [],
  });
}

export const SLATE_GUIDES: readonly StyleGuide[] = Object.freeze(
  FILMS.map(guideOf),
);
