// The phrase bank of the Keeper book, in its voice.
import type { ProseGuide } from "../../guide.ts";

const TAMSIN = "Tamsin";
const WENNA = "Wenna";
const EDRIC = "Edric";
const JOSS = "Joss";
const ANSEL = "Ansel";
const HILD = "Hild";
const VANE = "Vane";

const FOUNDRY = "the foundry";
const MOUNTAIN_ROAD = "the mountain road";
const HIGH_PATHS = "the high paths";
const HUT = "the shepherd's hut";
const ASKE = "Aske";
const MERRIN = "the river Merrin";
const DROVE_ROAD = "the drove road";
const NEW_TOLL_HOUSE = "the new toll-house";
const GREY_REACH = "the Grey Reach";
const FOUNDING_ROAD = "the founding road";
const RUINED_TOLL_HOUSE = "the ruined toll-house";
const WARDENS_POST = "the wardens' post";
const FORGE = "the cold forge";
const CARROW = "Carrow Height";
const HALL = "the Provost's hall";
const FOUNDING = "the Founding";
const BELL_TOWER = "Carrow's bell tower";

const WEATHER = "weather";
const SILENT_BELLS = "the silent bells";
const CRAFT = "the founder's craft";
const KINDNESS = "small kindnesses";
const HUSH = "the Hush";
const ROAD = "the road";
const TONGUE = "the bell-tongue";
const FIRST_SNOWS = "the first snows";
const WINTER = "deep winter";
const THAW = "the thaw";
const CASTING = "the casting";

// every day of the journey visits these, and each book its own season
const EVERY_DAY = [WEATHER, SILENT_BELLS, CRAFT, KINDNESS, HUSH];
const BOOK_ONE = [...EVERY_DAY, FIRST_SNOWS];
const BOOK_TWO = [...EVERY_DAY, WINTER];
const BOOK_THREE = [...EVERY_DAY, THAW];

export const KEEPER_PROSE: ProseGuide = Object.freeze({
  project: "keeper-prose",
  names: [
    "Tamsin Hale",
    "Dame Wenna Coyle",
    "Edric Fay",
    "Joss",
    "Brother Ansel",
    "Provost Ysolde Vane",
    "Hild",
    "Nettle",
    "Grey Reach",
    "Carrow Height",
    "Founding",
    "Aske",
    "Merrin",
    "Hush",
  ],
  style: {
    actionWords: 25,
    dialogueWords: 30,
    sentenceWords: 30,
    banned: [
      /\b(phone|car|computer|email|okay|OK|television|radio|plane|train)\b/,
    ],
  },
  chapters: [
    {
      number: 1,
      title: "The Flat Stroke",
      beats: [
        "Before dawn Tamsin tunes a new hand-bell on the casting floor while her master sleeps by the furnace.",
        "The valley bell above the foundry rings its morning peal and drops flat on the last stroke.",
        "Then it stops, and by noon the mist has come down the road as far as the yard gate.",
      ],
      ledger:
        "Day one. The valley bell above the foundry: silent after a flat last stroke. Rain at dawn, mist by noon. Tamsin Hale.",
      tags: [...BOOK_ONE, FOUNDRY],
    },
    {
      number: 2,
      title: "Mist at the Gate",
      beats: [
        "Nobody in the valley will drive a cart down the road, and the carrier turns back at the bridge.",
        "Tamsin climbs to the bell house and finds the valley bell's tongue cracked through at the crown.",
        "Her master listens to the broken tongue as if to a sick child, and says nothing until supper.",
      ],
      ledger:
        "Day two. The valley bell: silent, its tongue cracked at the crown. Mist thick to the eaves all day. Tamsin Hale.",
      tags: [...BOOK_ONE, FOUNDRY],
    },
    {
      number: 3,
      title: "Word from the Toll-House",
      beats: [
        "Dame Wenna Coyle rides down from the wardens' toll-house on a borrowed pony with her stick across the saddle.",
        "She tells the foundry that the pass road is closed until its bell is mended.",
        "Nobody left in the valley knows how to mend a road bell, and Wenna does not pretend otherwise.",
      ],
      ledger:
        "Day three. The pass bell at the toll-house: silent since the new moon, by Wenna's word. Drizzle and a low sky. Tamsin Hale.",
      tags: [...BOOK_ONE, FOUNDRY, WENNA],
    },
    {
      number: 4,
      title: "Nobody Left",
      beats: [
        "The master counts the founders he once knew on his burnt fingers and runs out of names.",
        "Wenna sleeps in the loft above the moulds and snores like a bellows.",
        "Tamsin walks the yard at night and listens to the silence where the valley bell should be.",
      ],
      ledger:
        "Day four. The valley bell: silent. Hard frost before light, the yard ruts set like iron. Tamsin Hale.",
      tags: [...BOOK_ONE, FOUNDRY, WENNA],
    },
    {
      number: 5,
      title: "The Oiled Sacking",
      beats: [
        "The master unwraps the last true bell-tongue from oiled sacking and lays it on the bench between them.",
        "He gives it to Tamsin, because her ear is the best in the valley and his knees are the worst.",
        "Edric Fay arrives at dusk with a satchel of maps and will not be left behind.",
      ],
      ledger:
        "Day five. The valley bell: silent, though the true tongue rings on the bench. Wind from the north. Tamsin Hale.",
      tags: [...BOOK_ONE, FOUNDRY, WENNA, EDRIC],
    },
    {
      number: 6,
      title: "Leaving the Valley",
      beats: [
        "They leave at first light with the tongue strapped to Tamsin's back and bread in Edric's satchel.",
        "The valley people stand at their doors to watch them go, and one child rings a cowbell.",
        "By evening they are higher than Tamsin has ever been, and the foundry is a spark below them.",
      ],
      ledger:
        "Day six. The cowbell at the last farm: rings, small and cheerful. Clear and cold, the first fine day. Tamsin Hale.",
      tags: [...BOOK_ONE, ROAD, TONGUE, WENNA, EDRIC],
    },
    {
      number: 7,
      title: "Sleet on the Climb",
      beats: [
        "The mountain road climbs in long switchbacks, and the sleet comes sideways at every turn.",
        "Wenna sets the pace with her stick and stops only to let Edric catch his breath.",
        "They sleep under an overhang with the tongue between them, wrapped against the wet.",
      ],
      ledger:
        "Day seven. No bell passed: silent road, only the wind. Sleet from noon until dark. Tamsin Hale.",
      tags: [...BOOK_ONE, MOUNTAIN_ROAD, ROAD, TONGUE, WENNA, EDRIC],
    },
    {
      number: 8,
      title: "The First Silent Belfry",
      beats: [
        "At the top of the switchbacks they reach a wayside belfry with its bell hanging still.",
        "Tamsin climbs the ladder and finds the clapper rusted to the lip of the bell.",
        "Below the belfry the road runs straight into the mist and does not come out.",
      ],
      ledger:
        "Day eight. The wayside belfry at the switchbacks: silent, its clapper rusted fast. Sleet turning to wet snow. Tamsin Hale.",
      tags: [...BOOK_ONE, MOUNTAIN_ROAD, ROAD, TONGUE, WENNA, EDRIC],
    },
    {
      number: 9,
      title: "Where the Road Went",
      beats: [
        "Edric unrolls his map in the lee of the belfry and shows them where the road ought to go.",
        "Wenna walks ten paces into the mist and comes back unable to say where she has been.",
        "They ring the wayside bell by hand, badly, and the mist draws back a few steps.",
      ],
      ledger:
        "Day nine. The wayside belfry: rings dull when rung by hand, enough for a few steps. Fog and no wind at all. Tamsin Hale.",
      tags: [...BOOK_ONE, MOUNTAIN_ROAD, ROAD, TONGUE, WENNA, EDRIC],
    },
    {
      number: 10,
      title: "Edric's Map",
      beats: [
        "Edric insists the road bends east, and the road, when they find it, bends west.",
        "Wenna tells him a map is a promise someone else made, and he writes that down.",
        "They make camp beside a milestone with its numbers worn away.",
      ],
      ledger:
        "Day ten. A broken bell-cote by the milestone: silent, the bell long gone. Rain all day. Tamsin Hale.",
      tags: [...BOOK_ONE, MOUNTAIN_ROAD, ROAD, TONGUE, WENNA, EDRIC],
    },
    {
      number: 11,
      title: "The Drowned Road",
      beats: [
        "The mist has pooled in the hollow of the road like water in a ditch, and nothing can be seen through it.",
        "Tamsin strikes the tongue with her knuckle, and the mist trembles but does not move.",
        "They wait at the edge all day, cold and short-tempered, and eat the last of the cheese.",
      ],
      ledger:
        "Day eleven. No bell passed: silent hollow, mist to the shoulder. Cold and still. Tamsin Hale.",
      tags: [...BOOK_ONE, MOUNTAIN_ROAD, TONGUE, WENNA, EDRIC],
    },
    {
      number: 12,
      title: "Goat Bells",
      beats: [
        "Out of the mist comes a sound of small bells, and then a goat, and then six more.",
        "Behind the goats comes Joss, who talks to them in a language nobody else has ever heard.",
        "He looks at the drowned road and tells them, kindly, that they are standing in the wrong place.",
      ],
      ledger:
        "Day twelve. Seven goat bells: ring, all a little out of tune. Mist lifting by evening. Tamsin Hale.",
      tags: [...BOOK_ONE, MOUNTAIN_ROAD, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 13,
      title: "The High Paths",
      beats: [
        "Joss leads them up off the road onto paths that only goats and goatherds use.",
        "The goat bells keep a pocket of clear air around them, a step ahead and a step behind.",
        "Edric draws the high paths as they walk and finds that his hand is shaking from the drop.",
      ],
      ledger:
        "Day thirteen. The goat bells: ring all day, and the path stays open around them. Bright, with snow on the tops. Tamsin Hale.",
      tags: [...BOOK_ONE, HIGH_PATHS, ROAD, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 14,
      title: "Nettle",
      beats: [
        "Nettle, the lead goat, will not cross a ledge until Joss has explained it to her.",
        "Tamsin asks Joss to teach her a word of his goat language, and he teaches her the word for patience.",
        "That night they shelter in a fold of rock, and Wenna tells a story about a warden and a bear.",
      ],
      ledger:
        "Day fourteen. The goat bells: ring, though Nettle's is cracked and buzzes. Wind on the ridges, cold enough to ache. Tamsin Hale.",
      tags: [...BOOK_ONE, HIGH_PATHS, ROAD, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 15,
      title: "The Shepherd's Hut",
      beats: [
        "Wenna turns her ankle on a loose stone above the hut and says nothing about it for a mile.",
        "The shepherd's hut is empty, with dry peat by the hearth and a kettle on its hook.",
        "Joss lights the fire, and the goats crowd in until there is no room for anyone to lie down.",
      ],
      ledger:
        "Day fifteen. A shepherd's bell on a nail by the hut door: rings when the door opens. First snow at dusk. Tamsin Hale.",
      tags: [...BOOK_ONE, HIGH_PATHS, HUT, ROAD, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 16,
      title: "Binding",
      beats: [
        "Snow keeps them in the hut, and Tamsin binds Wenna's ankle with strips torn from her own shirt.",
        "Wenna tells her that the wardens' post on her old road once kept a hundred bells and now keeps nine.",
        "Joss milks the goats and shares it out in the kettle lid, one swallow each.",
      ],
      ledger:
        "Day sixteen. The shepherd's bell: rings in the draught all night. Snow to the sill. Tamsin Hale.",
      tags: [...BOOK_ONE, HUT, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 17,
      title: "A Road He Drew",
      beats: [
        "In the night Edric admits that he has drawn every road in the land and walked none of them.",
        "Nobody laughs, and Wenna tells him that he is walking one now.",
        "Tamsin lies awake and hears no bell anywhere in the valleys below.",
      ],
      ledger:
        "Day seventeen. The shepherd's bell: rings once at dawn as the door is opened. Snow stopped, sky clearing. Tamsin Hale.",
      tags: [...BOOK_ONE, HUT, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 18,
      title: "Down into Aske",
      beats: [
        "The path drops into the silent valley of Aske, where the mist lies in the fields like wool.",
        "The people of Aske meet them at the first house and greet them with their hands.",
        "Nobody in Aske has spoken aloud since the mist came, and the goats are the loudest thing in the valley.",
      ],
      ledger:
        "Day eighteen. The great bell of Aske, seen from the pass: silent, the tower dark. Thin snow and still air. Tamsin Hale.",
      tags: [...BOOK_ONE, ASKE, ROAD, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 19,
      title: "Hands for Words",
      beats: [
        "A woman in Aske teaches Tamsin the hand signs for bread, thank you and how far.",
        "The village shares soup without a word, and the children laugh without a sound.",
        "Edric draws the valley and finds it has three roads in and none that lead out.",
      ],
      ledger:
        "Day nineteen. The great bell of Aske: silent. Grey all day, a little sleet. Tamsin Hale.",
      tags: [...BOOK_ONE, ASKE, TONGUE, WENNA, EDRIC, JOSS],
    },
    {
      number: 20,
      title: "Under the Great Bell",
      beats: [
        "They climb the tower of Aske by a stair worn hollow in the middle.",
        "Brother Ansel sits under the great bell with its cracked tongue across his knees.",
        "He looks at the true tongue on Tamsin's back for a long time before he speaks.",
      ],
      ledger:
        "Day twenty. The great bell of Aske: silent, its cracked tongue in Brother Ansel's lap. Fog in the tower. Tamsin Hale.",
      tags: [...BOOK_ONE, ASKE, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 21,
      title: "Too Hard",
      beats: [
        "Ansel tells them how he rang too hard on the night the mist came, and the tongue split.",
        "He has carried it every day since, as a penance, and has not rung anything.",
        "Tamsin tells him a split tongue is the founder's fault as often as the ringer's.",
      ],
      ledger:
        "Day twenty-one. The great bell of Aske: silent. Frost in the morning, rain by night. Tamsin Hale.",
      tags: [...BOOK_ONE, ASKE, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 22,
      title: "The Key on Its Nail",
      beats: [
        "In the morning Ansel locks the tower and hangs the key on its nail by the door.",
        "He brings the cracked tongue with him, wrapped in his cloak, and carries nothing else.",
        "The people of Aske walk with them to the valley's end and sign a farewell none of them can say.",
      ],
      ledger:
        "Day twenty-two. The great bell of Aske: silent, locked in its tower. Clear and bitter. Tamsin Hale.",
      tags: [...BOOK_ONE, ASKE, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 23,
      title: "The Merrin in Spate",
      beats: [
        "Rain in the hills has filled the river Merrin to its banks, brown and loud.",
        "The ford bell on its post in midstream is under water to its crown.",
        "Joss says the goats will not cross, and the goats agree with him.",
      ],
      ledger:
        "Day twenty-three. The ford bell on the Merrin: silent, drowned to its crown. Heavy rain. Tamsin Hale.",
      tags: [...BOOK_ONE, MERRIN, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 24,
      title: "The Rope",
      beats: [
        "They cross at night on a rope tied between two alders, one at a time, the goats on a lead.",
        "A tree comes down the river in the dark and takes the rope, and Tamsin goes under.",
        "She comes up downstream with the tongue still on her back and Edric's hand in her collar.",
      ],
      ledger:
        "Day twenty-four. The ford bell on the Merrin: silent under the flood. Rain all night. Tamsin Hale.",
      tags: [...BOOK_ONE, MERRIN, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 25,
      title: "The Far Bank",
      beats: [
        "On the far bank they dry out by a fire of driftwood and steam like washing.",
        "Joss gives Wenna goat's milk, Ansel cuts her a new stick, and Edric mends Tamsin's coat badly.",
        "Tamsin checks the tongue for cracks and finds none, and only then lets herself shiver.",
      ],
      ledger:
        "Day twenty-five. The ford bell on the Merrin: silent, though its head shows above the water. Sun at last, and wind. Tamsin Hale.",
      tags: [...BOOK_ONE, MERRIN, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 26,
      title: "The Drove Road",
      beats: [
        "North of the river they find the old drove road, wide and walled, made for cattle.",
        "The walking is easy for the first time in days, and Wenna limps less.",
        "They pass a herdsman's bell-post with no bell on it, only the hook.",
      ],
      ledger:
        "Day twenty-six. The herdsman's bell-post: silent, its bell taken down. Dry, with a gusting wind. Tamsin Hale.",
      tags: [...BOOK_ONE, DROVE_ROAD, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 27,
      title: "The Milestone",
      beats: [
        "At noon they reach a milestone with fresh paint on it that says Carrow.",
        "Edric checks it against his maps and says the distance is a lie, which it is.",
        "That night they hear a bell far to the north, so faint that only Tamsin is sure.",
      ],
      ledger:
        "Day twenty-seven. A bell far to the north: rings, very faint, perhaps. Cold and clear, with stars. Tamsin Hale.",
      tags: [...BOOK_ONE, DROVE_ROAD, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 28,
      title: "Carrow's Blue",
      beats: [
        "A new toll-house stands across the drove road with a barrier and wardens in Carrow's blue.",
        "Provost Vane sits at a table outside it with a ledger, as though she had been waiting for them.",
        "She asks their names and writes each one down in a neat, small hand.",
      ],
      ledger:
        "Day twenty-eight. The bell on the new toll-house: rings, bright and new, in Carrow's bronze. Fine and cold. Tamsin Hale.",
      tags: [
        ...BOOK_ONE,
        NEW_TOLL_HOUSE,
        ROAD,
        TONGUE,
        WENNA,
        EDRIC,
        JOSS,
        ANSEL,
        VANE,
      ],
    },
    {
      number: 29,
      title: "The Coin on the Table",
      beats: [
        "Vane offers Tamsin a silver coin and a carriage home in exchange for the tongue.",
        "Tamsin leaves the coin where it lies, and the wardens lift the barrier because Vane tells them to.",
        "Wenna says that was the most dangerous kindness she has ever seen.",
      ],
      ledger:
        "Day twenty-nine. The bell on the new toll-house: rings as they pass, to let Carrow know. Wind rising. Tamsin Hale.",
      tags: [
        ...BOOK_ONE,
        NEW_TOLL_HOUSE,
        ROAD,
        TONGUE,
        WENNA,
        EDRIC,
        JOSS,
        ANSEL,
        VANE,
      ],
    },
    {
      number: 30,
      title: "The Hush",
      beats: [
        "Beyond the toll-house the road climbs onto the Grey Reach, and the Hush lies over it.",
        "In the Hush no sound carries, not boots or goat bells or voices, and they walk holding hands.",
        "Ansel walks at the back and counts them by touch every hundred steps.",
      ],
      ledger:
        "Day thirty. No bell can be heard on the Grey Reach: silent, all of it. Mist without end. Tamsin Hale.",
      tags: [...BOOK_ONE, GREY_REACH, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 31,
      title: "The Great Cairn",
      beats: [
        "At the centre of the Reach stands the great cairn, with an old bell in an iron frame on top.",
        "Tamsin and Ansel hang the true tongue in the cairn's bell, and Tamsin rings it once.",
        "One peal opens the road the width of a cart, and they can hear each other breathing.",
      ],
      ledger:
        "Day thirty-one. The cairn bell on the Grey Reach: rings true, once, with the true tongue. Mist torn open, then still. Tamsin Hale.",
      tags: [...BOOK_ONE, GREY_REACH, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 32,
      title: "A Light to the North",
      beats: [
        "As soon as the ringing stops, the mist creeps back from the edges of the road.",
        "Far to the north a light shows on a height that might be Carrow.",
        "They take the tongue down from the cairn bell and agree, one by one, to go on.",
      ],
      ledger:
        "Day thirty-two. The cairn bell: silent again once its tongue is taken down. Mist closing in. Tamsin Hale.",
      tags: [...BOOK_ONE, GREY_REACH, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 33,
      title: "Past Her Boot",
      beats: [
        "Wenna's ankle has swollen past her boot, and she pretends it has not until she cannot stand.",
        "Snow falls on the Grey Reach for the first time that winter, fine as flour.",
        "They camp by the cairn and talk late about the roads ahead.",
      ],
      ledger:
        "Day thirty-three. The cairn bell: silent, its frame white with snow. Snow all day. Tamsin Hale.",
      tags: [...BOOK_TWO, GREY_REACH, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 34,
      title: "Two Roads",
      beats: [
        "Edric lays out the choice: the founding road north is steep and short, and the low road east is long.",
        "The low road passes the wardens' posts, where someone ought to be told what is coming.",
        "Nobody wants to be the one to say the company must split, so Wenna says it.",
      ],
      ledger:
        "Day thirty-four. The cairn bell: silent. Hard frost and a white sky. Tamsin Hale.",
      tags: [...BOOK_TWO, GREY_REACH, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 35,
      title: "The Whistle",
      beats: [
        "At the cairn Wenna gives Tamsin her warden's whistle and tells her to blow it only once.",
        "Tamsin and Joss and the goats go north, and the others take the low road east.",
        "Tamsin looks back until the snow takes them, and Wenna does not look back at all.",
      ],
      ledger:
        "Day thirty-five. The cairn bell: silent behind us. Snow and a crosswind. Tamsin Hale.",
      tags: [...BOOK_TWO, GREY_REACH, ROAD, TONGUE, WENNA, EDRIC, JOSS, ANSEL],
    },
    {
      number: 36,
      title: "Two and Seven",
      beats: [
        "Tamsin and Joss walk alone on the founding road, two people and seven goats.",
        "Joss talks to the goats all morning and to Tamsin not at all, which she finds she does not mind.",
        "They sleep in a hollow in the snow with the goats around them like a wall.",
      ],
      ledger:
        "Day thirty-six. No bell passed: silent road, only goat bells. Snow, then stars. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, ROAD, TONGUE, JOSS],
    },
    {
      number: 37,
      title: "Snow on the Founding Road",
      beats: [
        "The founding road is older than the drove road and narrower, cut into the side of the mountain.",
        "Snow lies deep on it, and Nettle breaks the trail with her chest.",
        "Tamsin finds an old bell-hook in the rock and hangs her hat on it for a joke.",
      ],
      ledger:
        "Day thirty-seven. An empty bell-hook in the rock: silent, with no bell for a hundred years. Deep snow. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, ROAD, TONGUE, JOSS],
    },
    {
      number: 38,
      title: "Swallows",
      beats: [
        "At dusk they reach a ruined toll-house with its roof half gone and swallows nesting in the rafters.",
        "The swallows have not gone south, and Joss says they are waiting for a bell to tell them when.",
        "Tamsin sweeps a corner clear of snow and makes a fire in the old hearth.",
      ],
      ledger:
        "Day thirty-eight. The ruined toll-house bell: silent, its rope rotted through. Snow, and the wind dropping. Tamsin Hale.",
      tags: [...BOOK_TWO, RUINED_TOLL_HOUSE, FOUNDING_ROAD, ROAD, TONGUE, JOSS],
    },
    {
      number: 39,
      title: "Porridge",
      beats: [
        "Snowed in, they make porridge in a cracked bowl found under the toll-house floor.",
        "Tamsin mends the bowl with pitch and is prouder of it than of any bell.",
        "Joss teaches her the goat word for enough, which sounds a lot like the word for more.",
      ],
      ledger:
        "Day thirty-nine. The ruined toll-house bell: silent. Snowed in all day. Tamsin Hale.",
      tags: [...BOOK_TWO, RUINED_TOLL_HOUSE, TONGUE, JOSS],
    },
    {
      number: 40,
      title: "A Lame Goat",
      beats: [
        "One of the goats goes lame, and Joss sits with her all night with his hand on her leg.",
        "Tamsin reads the toll-house's old tally marks scratched into the door frame.",
        "By morning the goat can stand, and Joss gives her a new name in goat that he will not translate.",
      ],
      ledger:
        "Day forty. The ruined toll-house bell: silent. Clear and bitter, the snow crusted. Tamsin Hale.",
      tags: [...BOOK_TWO, RUINED_TOLL_HOUSE, TONGUE, JOSS],
    },
    {
      number: 41,
      title: "The Gorge",
      beats: [
        "They leave the ruined toll-house, and the swallows follow them for a mile and then turn back.",
        "The road climbs into a gorge where the wind is so loud that Tamsin cannot think.",
        "She keeps her hand on Wenna's whistle all afternoon and does not blow it.",
      ],
      ledger:
        "Day forty-one. No bell passed in the gorge: silent, though the wind howls. Gale from the west. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, ROAD, TONGUE, JOSS],
    },
    {
      number: 42,
      title: "The Wardens' Post",
      beats: [
        "Above the gorge they find an old wardens' post with smoke coming from its chimney.",
        "Two old wardens keep it, and they ring its bell by hand every hour to keep the road open a little.",
        "They let Tamsin and Joss in without a question and give the goats the stable.",
      ],
      ledger:
        "Day forty-two. The bell at the wardens' post: rings every hour, by hand. Snow on the wind. Tamsin Hale.",
      tags: [...BOOK_TWO, WARDENS_POST, ROAD, TONGUE, JOSS],
    },
    {
      number: 43,
      title: "Wenna's Name",
      beats: [
        "When Tamsin shows them the whistle, the wardens remember Wenna's name and stand up straighter.",
        "They tell stories of Dame Wenna Coyle that Wenna has never told, mostly about her stick.",
        "Tamsin sleeps in a real bed for the first time since the foundry.",
      ],
      ledger:
        "Day forty-three. The bell at the wardens' post: rings every hour through the night. Soft snow falling. Tamsin Hale.",
      tags: [...BOOK_TWO, WARDENS_POST, TONGUE, JOSS],
    },
    {
      number: 44,
      title: "The Hour Bell",
      beats: [
        "Tamsin takes a turn at the wardens' bell and learns how tiring it is to ring well for an hour.",
        "She tells the wardens their bell is a quarter-tone flat, and they say they know.",
        "Joss mends the stable door, and the wardens pay him in cheese.",
      ],
      ledger:
        "Day forty-four. The bell at the wardens' post: rings, a quarter-tone flat. Clearing, then snow again. Tamsin Hale.",
      tags: [...BOOK_TWO, WARDENS_POST, TONGUE, JOSS],
    },
    {
      number: 45,
      title: "Bread for the Road",
      beats: [
        "The wardens give them two loaves and a map that is mostly crossings-out.",
        "They walk on north, and the wardens' bell rings behind them until the road turns.",
        "Tamsin counts the strokes until she cannot hear them, and keeps counting.",
      ],
      ledger:
        "Day forty-five. The bell at the wardens' post: rings behind us until the road turns. Bright and very cold. Tamsin Hale.",
      tags: [...BOOK_TWO, WARDENS_POST, FOUNDING_ROAD, ROAD, TONGUE, JOSS],
    },
    {
      number: 46,
      title: "Where the Road Crosses a Stream",
      beats: [
        "The road comes down to a stream and crosses it by a stone bridge.",
        "Beside the bridge is a forge with no fire in it and a door left open to the snow.",
        "Someone has been sleeping by the cold anvil, and someone is watching them from the loft.",
      ],
      ledger:
        "Day forty-six. A forge bell over the bridge: silent, hung for the smith's customers. Thaw for an hour at noon, then frost. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, ROAD, TONGUE, JOSS],
    },
    {
      number: 47,
      title: "Hild",
      beats: [
        "The watcher is Hild, who climbs down from the loft with a hammer and puts it away when she sees the goats.",
        "Her grandmother poured the last bell at the Founding, she says, and nobody believes her.",
        "Tamsin believes her at once, because Hild holds her hammer the way a founder does.",
      ],
      ledger:
        "Day forty-seven. The forge bell: silent, its clapper in Hild's scrap box. Frost and fog. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 48,
      title: "Chalk on the Floor",
      beats: [
        "Hild asks to hear the tongue, and Tamsin strikes it once against the cold anvil.",
        "Hild listens with her eyes shut and then draws a bell in chalk on the forge floor.",
        "The chalk bell is the right shape for that note, and Tamsin has never seen anyone do that.",
      ],
      ledger:
        "Day forty-eight. The forge bell: silent, but the true tongue rings against the anvil. Fog all day. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 49,
      title: "The Shape of a Bell",
      beats: [
        "Hild teaches Tamsin how a bell's shape decides its note before a single grain of bronze is poured.",
        "They draw bells all day on the floor, and Joss walks around them carefully.",
        "At night Hild lights the forge for the first time in a year, to keep them warm.",
      ],
      ledger:
        "Day forty-nine. The forge bell: silent. Snow on the bridge. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 50,
      title: "Riders in Blue",
      beats: [
        "Riders in Carrow's blue come down the road, asking at every door for a girl with a bell-tongue.",
        "Hild hides the tongue under her heap of scrap iron and stands in front of it with her hammer.",
        "The riders look at the goats, the forge and the girl with chalk on her hands, and ride on.",
      ],
      ledger:
        "Day fifty. The forge bell: silent. Fresh snow, with riders' tracks in it. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 51,
      title: "The Shape of a Note",
      beats: [
        "Hild teaches Tamsin to sing a note into the mouth of a bell and hear the shape it wants.",
        "Tamsin sings until her throat is raw, and Hild says she is nearly there.",
        "Joss sings with them in goat, which does not help.",
      ],
      ledger:
        "Day fifty-one. The forge bell: silent, though Hild has hung its clapper back. Freezing fog. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 52,
      title: "Snowed In at the Forge",
      beats: [
        "A blizzard closes the road, and they stay by Hild's fire for a day with nothing to do but talk.",
        "Hild shows them her grandmother's tools, the strickle board and the calipers, oiled and wrapped.",
        "Tamsin tells Hild about the foundry and finds she is homesick for the first time.",
      ],
      ledger:
        "Day fifty-two. The forge bell: silent under the snow. Blizzard. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 53,
      title: "Bells on the Low Road",
      beats: [
        "When the storm clears, Tamsin hears bells far to the east, rung by hand, one after another.",
        "She knows at once that Wenna and Ansel are ringing the low-road bells to hold the mists back.",
        "Hild says nobody has rung those bells in her lifetime, and they listen until it is dark.",
      ],
      ledger:
        "Day fifty-three. The low-road bells far to the east: ring by hand, one after another. Clear after the storm. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 54,
      title: "The Fire Banked",
      beats: [
        "Hild decides to go to Carrow with them, and spends the day packing her grandmother's tools.",
        "Tamsin helps her bank the forge fire so that it will keep for whoever comes next.",
        "Joss gives Hild the goat word for friend, and she uses it wrongly all evening.",
      ],
      ledger:
        "Day fifty-four. The forge bell: rings once as Hild locks the door. Still and cold. Tamsin Hale.",
      tags: [...BOOK_TWO, FORGE, TONGUE, JOSS, HILD],
    },
    {
      number: 55,
      title: "The Steep Stair",
      beats: [
        "North of the forge the founding road turns into a stair cut in the rock, a thousand steps or more.",
        "The goats go up it as if it were a meadow, and the three of them crawl.",
        "Halfway up they find a niche with a small bell in it, green with age.",
      ],
      ledger:
        "Day fifty-five. A niche bell on the stair: rings, thin and green, when Tamsin touches it. Wind and spindrift. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, ROAD, TONGUE, JOSS, HILD],
    },
    {
      number: 56,
      title: "The Niche Bell",
      beats: [
        "Tamsin cleans the niche bell with snow and her sleeve until it rings properly.",
        "Hild says the founders put a bell every hundred steps so that a climber was never alone.",
        "They sleep on a ledge with the tongue tied to Tamsin's wrist.",
      ],
      ledger:
        "Day fifty-six. The niche bell on the stair: rings true once it is clean. Snow showers. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, ROAD, TONGUE, JOSS, HILD],
    },
    {
      number: 57,
      title: "Carrow from Below",
      beats: [
        "From the top of the stair they see Carrow Height for the first time, black against the snow.",
        "Its walls are hung with bells, and every one of them is silent.",
        "Hild says the Provost keeps them silent on purpose, and Tamsin does not want to believe it.",
      ],
      ledger:
        "Day fifty-seven. The wall bells of Carrow Height, seen from below: silent, every one. Bright and windless. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, CARROW, ROAD, TONGUE, JOSS, HILD],
    },
    {
      number: 58,
      title: "Walking by the Stones",
      beats: [
        "On the last mile Edric catches them up, out of breath, with his map crossed out from edge to edge.",
        "He has walked the founding road alone, finding the way by the stones and not the map.",
        "He tells them that Wenna and Ansel are ringing the low road open, post by post.",
      ],
      ledger:
        "Day fifty-eight. No bell passed on the last mile: silent road. Grey and cold. Tamsin Hale.",
      tags: [
        ...BOOK_TWO,
        FOUNDING_ROAD,
        CARROW,
        ROAD,
        TONGUE,
        JOSS,
        HILD,
        EDRIC,
      ],
    },
    {
      number: 59,
      title: "Edric's New Map",
      beats: [
        "Edric shows them a new map, drawn only from what he has walked, with every step counted.",
        "It is smaller and plainer than his old maps, and Tamsin says it is the best one he has made.",
        "They camp below the walls, and nobody sleeps much.",
      ],
      ledger:
        "Day fifty-nine. The wall bells of Carrow: silent above us all night. Frost. Tamsin Hale.",
      tags: [...BOOK_TWO, FOUNDING_ROAD, CARROW, TONGUE, JOSS, HILD, EDRIC],
    },
    {
      number: 60,
      title: "The Iron Gate",
      beats: [
        "In the morning they climb to the iron gate of Carrow Height, and it opens before they knock.",
        "Wardens in blue lead them through streets so quiet that the goats seem rude.",
        "Every house in Carrow has a bell by its door, and none of them has a clapper.",
      ],
      ledger:
        "Day sixty. The gate bell of Carrow Height: silent, its clapper taken out. Clear and hard frost. Tamsin Hale.",
      tags: [...BOOK_TWO, CARROW, ROAD, TONGUE, JOSS, HILD, EDRIC],
    },
    {
      number: 61,
      title: "The Provost's Hall",
      beats: [
        "Provost Vane receives them in her hall, kindly and exactly, with bread already on the table.",
        "She knows every name in the company and asks after Wenna's ankle.",
        "Tamsin keeps the tongue on her back through the whole meal.",
      ],
      ledger:
        "Day sixty-one. The hall bell of Carrow: silent, a bell for show. Snow on the roofs. Tamsin Hale.",
      tags: [...BOOK_TWO, HALL, CARROW, TONGUE, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 62,
      title: "Into Her Keeping",
      beats: [
        "Vane asks for the tongue, for safekeeping, and the wardens at the door make clear that the asking is a courtesy.",
        "Tamsin hands it over because Joss is standing next to a warden with a spear.",
        "Vane locks the tongue in a cabinet in her hall and thanks her as if it were a gift.",
      ],
      ledger:
        "Day sixty-two. The hall bell of Carrow: silent, and the true tongue locked beneath it. Snow on and off. Tamsin Hale.",
      tags: [...BOOK_TWO, HALL, TONGUE, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 63,
      title: "A Guest of Carrow",
      beats: [
        "Tamsin is given a warm room with a window that does not open.",
        "She is a guest of Carrow, Vane says, and guests of Carrow do not leave until they are asked to.",
        "From her window Tamsin can see the road she came by, and the mist creeping up it.",
      ],
      ledger:
        "Day sixty-three. The wall bells of Carrow: silent, seen from my window. Mist on the road below. Tamsin Hale.",
      tags: [...BOOK_TWO, CARROW, HALL, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 64,
      title: "Fewer Than Yesterday",
      beats: [
        "Hild is lodged with the Provost's smith and Joss with the goats, and nobody is allowed to visit.",
        "Edric is given paper and ink and asked to draw Carrow, which he refuses to do.",
        "At night Tamsin counts the valley bells she can still hear below Carrow, and there is one fewer than the night before.",
      ],
      ledger:
        "Day sixty-four. The far valley bells below Carrow: ring, but fewer than yesterday. Wind from the north. Tamsin Hale.",
      tags: [...BOOK_TWO, CARROW, HALL, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 65,
      title: "The Corridors",
      beats: [
        "Tamsin is allowed to walk the corridors of Carrow, always with a warden two steps behind.",
        "Every corridor has a bell-rope hanging in it, and none of the ropes reaches a bell.",
        "She learns the sound of the warden's boots so well she could find him in the dark.",
      ],
      ledger:
        "Day sixty-five. The corridor bells of Carrow: silent, their ropes cut. Frost on the inside of the glass. Tamsin Hale.",
      tags: [...BOOK_THREE, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 66,
      title: "Black Stone",
      beats: [
        "Following a draught down a stair, Tamsin finds the Founding, a hall of black stone under the town.",
        "Its founding pit is cold and full of dust, and its bellows are cracked like old shoes.",
        "She stands at the edge of the pit and feels the hundred cold years in her feet.",
      ],
      ledger:
        "Day sixty-six. The great bell-frame of the Founding: silent, with no bell in it. Cold underground, sleet above. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDING, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 67,
      title: "The Warden Looks Away",
      beats: [
        "The warden who follows her pretends not to have seen the stair, and that night he leaves a lamp by it.",
        "Tamsin goes back down with the lamp and reads the founders' marks scratched into the walls.",
        "The last mark is Hild's grandmother's, cut a hundred years ago.",
      ],
      ledger:
        "Day sixty-seven. The great bell-frame of the Founding: silent. Sleet and a raw wind. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDING, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 68,
      title: "Hild Comes Down",
      beats: [
        "Tamsin brings Hild down to the Founding at night, past the warden who coughs loudly whenever they pass.",
        "Hild walks around the pit touching everything, and does not speak for an hour.",
        "Then she says the bellows can be mended and the pit dug out in ten days, if there were bronze.",
      ],
      ledger:
        "Day sixty-eight. The great bell-frame of the Founding: silent. Thaw dripping from the eaves. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDING, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 69,
      title: "Mending the Bellows",
      beats: [
        "Joss takes leather from the Provost's stables, and Hild patches the bellows by lamplight.",
        "Tamsin works the bellows for the first time, and the old hall breathes.",
        "They sweep the pit and find a grain of bronze in the dust, bright as a seed.",
      ],
      ledger:
        "Day sixty-nine. The Founding: silent, but the bellows breathe again. Rain on the thaw. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDING, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 70,
      title: "What an Open Road Costs",
      beats: [
        "Vane sends for Tamsin and sets out, kindly and exactly, what an open road costs Carrow.",
        "If the valleys ring their own bells, she says, nobody will pay Carrow's tolls, and Carrow will starve.",
        "Tamsin finds that she cannot answer, and hates that she cannot.",
      ],
      ledger:
        "Day seventy. The hall bell of Carrow: silent. Wet snow, melting as it lands. Tamsin Hale.",
      tags: [...BOOK_THREE, HALL, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 71,
      title: "It Belonged to the Roads",
      beats: [
        "Hild is brought before the Provost and says plainly that the Founding was never Carrow's.",
        "It belonged to the roads, she says, and every valley sent its bronze to it once.",
        "Vane listens, writes it in her ledger, and sends Hild back to the smith.",
      ],
      ledger:
        "Day seventy-one. The hall bell of Carrow: silent. Fog in the courtyard. Tamsin Hale.",
      tags: [...BOOK_THREE, HALL, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 72,
      title: "The Ledgers",
      beats: [
        "Edric is given Carrow's toll ledgers to copy and reads them instead.",
        "He finds that Carrow's tolls began in the year the Founding went cold.",
        "He shows Tamsin the page, hidden in the margin of a drawing Vane asked him to make.",
      ],
      ledger:
        "Day seventy-two. The hall bell of Carrow: silent. Thaw and mud in the streets. Tamsin Hale.",
      tags: [...BOOK_THREE, HALL, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 73,
      title: "News from Below",
      beats: [
        "A carter comes up from the valleys with news that two more road bells fell silent this week.",
        "The Hush has reached the foot of the founding stair, he says, and is still climbing.",
        "Tamsin asks him about the low road, and he says someone there is still ringing by hand.",
      ],
      ledger:
        "Day seventy-three. The far valley bells: ring, but only two that I can hear. Rain. Tamsin Hale.",
      tags: [...BOOK_THREE, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 74,
      title: "Goats in the Garden",
      beats: [
        "The goats get into the Provost's kitchen garden and eat everything but the thistles.",
        "The wardens chase them for an hour while Joss explains to Nettle, in goat, that this is very bad.",
        "In the confusion Joss learns which window of the hall has a broken catch.",
      ],
      ledger:
        "Day seventy-four. The wall bells of Carrow: silent. Bright and thawing. Tamsin Hale.",
      tags: [...BOOK_THREE, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 75,
      title: "A Plan in Goat",
      beats: [
        "Joss and Edric make a plan, and Edric draws it as a map that only Joss can read.",
        "Tamsin is not told the plan, so that she cannot be blamed for it.",
        "She spends the day in the Founding with Hild, cutting a strickle board to the shape of the chalk bell.",
      ],
      ledger:
        "Day seventy-five. The great bell-frame of the Founding: silent. Showers. Tamsin Hale.",
      tags: [...BOOK_THREE, CARROW, FOUNDING, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 76,
      title: "The Broken Catch",
      beats: [
        "At night Joss lets the goats into the Provost's hall, and every warden in Carrow runs after them.",
        "Edric climbs in by the window with the broken catch and takes the tongue from the cabinet.",
        "They carry it up to Carrow's empty bell tower, where nobody thinks to look for it.",
      ],
      ledger:
        "Day seventy-six. The empty bell tower of Carrow: silent, with the true tongue hidden under its stair. Rain all night. Tamsin Hale.",
      tags: [...BOOK_THREE, HALL, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 77,
      title: "The Open Cabinet",
      beats: [
        "Vane finds the cabinet open in the morning and says nothing at all.",
        "She closes the gate of Carrow and doubles the wardens on the walls.",
        "Tamsin is sent for and asked politely where the tongue is, and says truthfully that she does not know.",
      ],
      ledger:
        "Day seventy-seven. The gate bell of Carrow: silent, the gate shut. Low cloud. Tamsin Hale.",
      tags: [...BOOK_THREE, HALL, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 78,
      title: "The Empty Tower",
      beats: [
        "Tamsin climbs the empty bell tower and finds the tongue wrapped in Edric's coat under the stair.",
        "From the top of the tower she can see the Hush lying in every valley like milk in a bowl.",
        "She stays until dark, holding the tongue and listening to nothing.",
      ],
      ledger:
        "Day seventy-eight. The empty bell tower of Carrow: silent, but the tongue is safe in it. Clear, with mist in every valley. Tamsin Hale.",
      tags: [...BOOK_THREE, BELL_TOWER, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 79,
      title: "The Mist at the Walls",
      beats: [
        "The mist reaches the walls of Carrow, and even the Provost's wardens go quiet.",
        "Carrow's own bells cannot hold it back, because Carrow took their clappers out years ago.",
        "Vane stands on the wall all afternoon, watching it, and does not send for anyone.",
      ],
      ledger:
        "Day seventy-nine. The wall bells of Carrow: silent, with the mist at the foot of them. Mist. Tamsin Hale.",
      tags: [...BOOK_THREE, CARROW, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 80,
      title: "Bells Coming Up",
      beats: [
        "In the evening Tamsin hears bells below the walls, rung by hand, coming up the road.",
        "The mist opens around them as they climb, a little at a time.",
        "She runs to the wall and sees lanterns, and among them a stick waving.",
      ],
      ledger:
        "Day eighty. The hand-bells on the road below: ring, coming closer. Mist breaking at dusk. Tamsin Hale.",
      tags: [...BOOK_THREE, CARROW, ROAD, JOSS, HILD, EDRIC, VANE],
    },
    {
      number: 81,
      title: "At the Gate",
      beats: [
        "Wenna and Ansel come to the gate of Carrow at the head of the people of the silent valleys.",
        "Ansel is ringing a hand-bell, the first bell he has rung since the night his tongue split.",
        "Vane opens the gate herself, because there is no one else on the wall who will.",
      ],
      ledger:
        "Day eighty-one. Ansel's hand-bell at the gate of Carrow: rings, the first time in years. Thaw and wind. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        CARROW,
        ROAD,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 82,
      title: "What Bronze They Could",
      beats: [
        "The valley people have carried what bronze they could: pots, latches, buckles and one candlestick.",
        "They pile it in the courtyard of the Founding, and Hild weighs it twice.",
        "There is not quite enough, until Ansel puts his cracked tongue on the pile.",
      ],
      ledger:
        "Day eighty-two. Ansel's cracked tongue on the bronze pile: silent for good. Fine, with a soft wind. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        CARROW,
        FOUNDING,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 83,
      title: "Wenna and the Provost",
      beats: [
        "Wenna and Vane sit in the Provost's hall for most of a day, two old women who have both kept roads.",
        "Nobody hears what they say, but Vane comes out and orders the wardens to help dig the pit.",
        "Wenna comes out after her and asks for something to eat.",
      ],
      ledger:
        "Day eighty-three. The hall bell of Carrow: silent, but the doors are open. Rain, then sun. Tamsin Hale.",
      tags: [...BOOK_THREE, HALL, JOSS, HILD, EDRIC, VANE, WENNA, ANSEL],
    },
    {
      number: 84,
      title: "Digging the Pit",
      beats: [
        "Everyone in Carrow who can hold a spade digs out the founding pit, wardens and valley people together.",
        "Hild builds the mould from clay and loam on Tamsin's strickle board, turning it by hand.",
        "Edric measures it all and writes the numbers on the wall in chalk.",
      ],
      ledger:
        "Day eighty-four. The great bell-frame of the Founding: silent, waiting. Mild and damp. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDING, JOSS, HILD, EDRIC, VANE, WENNA, ANSEL],
    },
    {
      number: 85,
      title: "The Mould",
      beats: [
        "The mould dries by a slow fire for a day and a night, and someone sits up with it at every hour.",
        "Tamsin takes her turn at midnight and talks to the mould as Joss talks to goats.",
        "Vane comes down to the Founding alone and stands at the edge of the pit for a long time.",
      ],
      ledger:
        "Day eighty-five. The great bell-frame of the Founding: silent. Rain on the roofs, warm below. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDING, JOSS, HILD, EDRIC, VANE, WENNA, ANSEL],
    },
    {
      number: 86,
      title: "One Bright Rope",
      beats: [
        "The bronze melts in the furnace from dawn, and everyone takes a turn at the bellows, Provost and goatherd alike.",
        "At noon Hild opens the furnace, and the bronze goes into the pit in one bright rope.",
        "Nobody speaks until the mould is full, and then everybody does.",
      ],
      ledger:
        "Day eighty-six. The new bell of the Founding: silent, still in its mould. Sun through the smoke holes. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        FOUNDING,
        CASTING,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 87,
      title: "Cooling",
      beats: [
        "The bell must cool in its pit for three days, and there is nothing to do but wait.",
        "Tamsin cannot sit still, so Wenna takes her walking on the walls.",
        "From the walls they can see that the mist has stopped climbing.",
      ],
      ledger:
        "Day eighty-seven. The new bell: silent, cooling in the pit. Thaw and birdsong. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        FOUNDING,
        CASTING,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 88,
      title: "Two Marks",
      beats: [
        "While the bell cools, Hild cuts her own mark into the wall beside her grandmother's.",
        "Tamsin is asked to cut hers too, and her hand shakes, and the mark is crooked.",
        "Hild says a crooked mark is the honest kind.",
      ],
      ledger:
        "Day eighty-eight. The new bell: silent, still cooling. Rain in the night. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        FOUNDING,
        CASTING,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 89,
      title: "Breaking the Mould",
      beats: [
        "They break the mould away, and the bell comes out of the clay dark and rough as a potato.",
        "Hild knocks it once with her knuckle and nods, which is the most she has ever said about anything.",
        "They spend the day scouring it until it shines.",
      ],
      ledger:
        "Day eighty-nine. The new bell, out of its mould: rings, rough and low, at a knuckle. Fine and warm. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        FOUNDING,
        CASTING,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 90,
      title: "Tuning",
      beats: [
        "Tamsin tunes the new bell with a file, a shaving at a time, listening between every stroke.",
        "Her ear is so sure that Hild hands her the file and stops watching.",
        "By evening the bell rings true, and Tamsin sits down on the floor of the Founding and cries.",
      ],
      ledger:
        "Day ninety. The new bell: rings true at last, under the file. Rain and a warm wind. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        FOUNDING,
        CASTING,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 91,
      title: "The Yoke",
      beats: [
        "Everyone hauls the bell up to Carrow's empty tower on ropes, and it hangs from its new yoke.",
        "Tamsin hangs the true tongue in it and steps back.",
        "Nobody rings it that night, because Hild says a bell should sleep once in its tower first.",
      ],
      ledger:
        "Day ninety-one. The new bell in Carrow's tower: silent, hung and resting. Clear sky. Tamsin Hale.",
      tags: [...BOOK_THREE, BELL_TOWER, JOSS, HILD, EDRIC, VANE, WENNA, ANSEL],
    },
    {
      number: 92,
      title: "The First Peal",
      beats: [
        "At dawn Tamsin rings the new bell, and what a bell sounds like after a hundred years goes down every road.",
        "The mist draws back from the walls, then from the stair, then from the valleys one by one.",
        "Down on the low road, far to the east, someone rings a hand-bell in answer.",
      ],
      ledger:
        "Day ninety-two. The new bell of the Founding: rings true, and every road hears it. Clear and still. Tamsin Hale.",
      tags: [...BOOK_THREE, BELL_TOWER, JOSS, HILD, EDRIC, VANE, WENNA, ANSEL],
    },
    {
      number: 93,
      title: "Noon",
      beats: [
        "At noon Vane climbs the tower and rings the bell herself.",
        "She orders the clappers put back in every bell in Carrow, and the town is suddenly very loud.",
        "The road wardens open the passes, and the toll-house barriers are lifted.",
      ],
      ledger:
        "Day ninety-three. Every bell in Carrow: rings, with its clapper back in. Sun and a thawing wind. Tamsin Hale.",
      tags: [
        ...BOOK_THREE,
        BELL_TOWER,
        CARROW,
        JOSS,
        HILD,
        EDRIC,
        VANE,
        WENNA,
        ANSEL,
      ],
    },
    {
      number: 94,
      title: "The Company Parts",
      beats: [
        "Hild stays at the Founding, because there are a hundred valleys that will need bells.",
        "Wenna and Ansel take the low road home, and Edric goes with them to draw it as he walks.",
        "Vane gives Tamsin the silver coin again, and this time Tamsin takes it, for the foundry.",
      ],
      ledger:
        "Day ninety-four. The new bell of Carrow: rings the hours. Fine and mild. Tamsin Hale.",
      tags: [...BOOK_THREE, CARROW, JOSS, HILD, EDRIC, VANE, WENNA, ANSEL],
    },
    {
      number: 95,
      title: "The Road Home",
      beats: [
        "Tamsin and Joss walk home by the founding road with the goats, and every bell they pass is ringing.",
        "The swallows at the ruined toll-house have begun to build again.",
        "Joss leaves her at the high paths with a goat word she does not know, and will not tell her what it means.",
      ],
      ledger:
        "Day ninety-five. The niche bells on the stair: ring, every hundred steps. Spring rain. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDING_ROAD, ROAD, JOSS],
    },
    {
      number: 96,
      title: "The Valley Bell",
      beats: [
        "Tamsin comes down into her own valley on a soft evening, and her master is waiting at the yard gate.",
        "She climbs to the valley bell and fits it with a tongue that Hild cast for her at Carrow.",
        "It rings true, and down in the yard her master puts his hands over his face.",
      ],
      ledger:
        "Day ninety-six. The valley bell above the foundry: rings true. Soft rain, and the mist gone from the road. Tamsin Hale.",
      tags: [...BOOK_THREE, FOUNDRY, ROAD],
    },
  ],
  sentences: [
    {
      text: "The rain came over the ridge in grey curtains, one behind another, and each one was colder than the last.",
      tags: [WEATHER],
    },
    {
      text: "By midmorning the wind had found every gap in Tamsin's coat and settled in to stay.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The cloud sat so low on the mountain that the tops of the pines were gone.",
      tags: [WEATHER],
    },
    {
      text: "There was no sun to speak of, only a paler patch of sky that moved slowly south.",
      tags: [WEATHER],
    },
    {
      text: "Rain fell all afternoon without hurry, as if it had nowhere else to be.",
      tags: [WEATHER],
    },
    {
      text: "The wind dropped at dusk, and the quiet that came after it was almost worse.",
      tags: [WEATHER],
    },
    {
      text: "A cold mist rose off the wet ground and hung at knee height until noon.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin's breath smoked in front of her, and her fingers would not close properly on the strap.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The light went early, as it does in the mountains, all at once and without warning.",
      tags: [WEATHER],
    },
    {
      text: "It rained in the night, and by morning every hollow in the road held a skin of water.",
      tags: [WEATHER],
    },
    {
      text: "The sky cleared for an hour at noon and showed a hard, pale blue that promised nothing.",
      tags: [WEATHER],
    },
    {
      text: "A wind from the north came down the valley like a door left open somewhere.",
      tags: [WEATHER],
    },
    {
      text: "Clouds moved fast overhead while the air on the ground stayed perfectly still.",
      tags: [WEATHER],
    },
    {
      text: "The weather could not make up its mind, and gave them sun, rain and hail before supper.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin Hale had grown up under a valley sky and had never seen so much of it at once.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The morning came grey and stayed grey, and nobody mentioned it because there was nothing to say.",
      tags: [WEATHER],
    },
    {
      text: "Rain ran off the brim of Tamsin's hat in a steady line, just past the end of her nose.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The wind brought the smell of wet stone and, once, of woodsmoke from somewhere out of sight.",
      tags: [WEATHER],
    },
    {
      text: "Frost had silvered the grass overnight, and every blade cracked underfoot.",
      tags: [WEATHER],
    },
    {
      text: "It was the kind of cold that comes up through the soles of the boots and does not leave.",
      tags: [WEATHER],
    },
    {
      text: "The clouds broke towards evening and let through one long bar of yellow light.",
      tags: [WEATHER],
    },
    {
      text: "A drizzle so fine it could hardly be seen soaked them through by noon.",
      tags: [WEATHER],
    },
    {
      text: "The wind changed in the afternoon and blew straight into their faces for the rest of the day.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin watched a squall walk across the far side of the valley on long grey legs.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The morning was so still that she could hear water dripping from a rock a hundred yards away.",
      tags: [WEATHER],
    },
    {
      text: "Hail came out of a clear sky for a minute and then stopped, as though it had made a mistake.",
      tags: [WEATHER],
    },
    {
      text: "The air was thin and cold and smelled of nothing at all.",
      tags: [WEATHER],
    },
    {
      text: "Low sun came in under the cloud at dusk and lit the rain from the side.",
      tags: [WEATHER],
    },
    {
      text: "Rain on the slopes above sent small streams across the road, each one loud for its size.",
      tags: [WEATHER],
    },
    {
      text: "A fog came up from the valleys after dark and put out the stars one by one.",
      tags: [WEATHER],
    },
    {
      text: "The wind howled round the rocks all night, and nobody slept more than an hour together.",
      tags: [WEATHER],
    },
    {
      text: "It was dry for once, and cold enough that the dryness felt like a gift.",
      tags: [WEATHER],
    },
    {
      text: "Cloud poured over the ridge like porridge over the lip of a pot.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin learned to read the weather from the colour of the hills, the way her master read bronze.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "By evening the rain had become the same grey as the sky, and it was hard to say where one stopped.",
      tags: [WEATHER],
    },
    {
      text: "A cold, steady wind blew from first light to last and never once changed its note.",
      tags: [WEATHER],
    },
    {
      text: "The sky to the west went the colour of a bruise, and the wind began to smell of rain.",
      tags: [WEATHER],
    },
    {
      text: "Morning mist lay in the hollows like water in a basin and burned off slowly.",
      tags: [WEATHER],
    },
    {
      text: "There was a ring round the moon that night, and Tamsin knew what that meant for the morning.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "Wet leaves lay pasted to the stones, and every step was a small negotiation.",
      tags: [WEATHER],
    },
    {
      text: "The wind dropped, the cloud lifted, and for an hour the whole range stood clear to the north.",
      tags: [WEATHER],
    },
    {
      text: "A thin rain fell, too light to bother with and too steady to ignore.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin turned her face up to the rain because she was too wet already for it to matter.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The cold made her teeth ache and her ears ring, though nothing else was ringing.",
      tags: [WEATHER],
    },
    {
      text: "Gusts came round the shoulder of the hill and pushed at them like a crowd.",
      tags: [WEATHER],
    },
    {
      text: "The clouds were so close overhead that Tamsin felt she could have reached up and wrung them out.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "In the grey light before dawn the whole world looked like pewter.",
      tags: [WEATHER],
    },
    {
      text: "It stopped raining at last, and the dripping of the trees was the only sound for miles.",
      tags: [WEATHER],
    },
    {
      text: "The wind blew the tops off the puddles and threw them in their faces.",
      tags: [WEATHER],
    },
    {
      text: "A long, cold evening came down, and the hills went from green to grey to black.",
      tags: [WEATHER],
    },
    {
      text: "Damp got into everything: the bread, the blankets, the pages of every book.",
      tags: [WEATHER],
    },
    {
      text: "The sun came up red and went in again almost at once, as though it had thought better of it.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin had stopped feeling her toes by noon and stopped worrying about them by dusk.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The weather was neither good nor bad, which on the mountain counted as good.",
      tags: [WEATHER],
    },
    {
      text: "A soft rain began at dusk and kept on through the night, patient as a nurse.",
      tags: [WEATHER],
    },
    {
      text: "Wind sang in the dead bracken, the only singing for miles.",
      tags: [WEATHER],
    },
    {
      text: "The cloud parted for a moment and showed a valley so far below that it looked painted.",
      tags: [WEATHER],
    },
    {
      text: "Water ran down the inside of Tamsin's sleeves and gathered at her elbows.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "It was a raw day, the kind her master called a three-coat day, though she had only one coat.",
      tags: [WEATHER],
    },
    {
      text: "The morning smelled of rain that had not yet arrived.",
      tags: [WEATHER],
    },
    {
      text: "A gale blew all night, and by morning it had blown itself out and left the sky scrubbed.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin pulled her hood down to her eyebrows and walked with her eyes on her boots.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "Cold air slid down from the tops at dusk and filled the valley floor like water rising in a trough.",
      tags: [WEATHER],
    },
    {
      text: "The rain eased to a mizzle and then to nothing, and the first bird sang.",
      tags: [WEATHER],
    },
    {
      text: "Even the stones looked cold, grey and wet and hunched against the wind.",
      tags: [WEATHER],
    },
    {
      text: "Tamsin judged the time by the light, because there was no bell to judge it by.",
      tags: [WEATHER, SILENT_BELLS, TAMSIN],
    },
    {
      text: "A bright, hard morning came after the rain, and every edge on the mountain was sharp.",
      tags: [WEATHER],
    },
    {
      text: "Sleet rattled on Tamsin's hood like small stones thrown by somebody who meant well.",
      tags: [WEATHER, TAMSIN],
    },
    {
      text: "The wind was at their backs for once, and they walked as if pushed by a friendly hand.",
      tags: [WEATHER],
    },
    {
      text: "Evening came on with a long grey hush, and the cold settled in for the night.",
      tags: [WEATHER],
    },
    {
      text: "In the old days every road in the land had a bell on it, and every bell had a ringer.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A road bell was hung where the mists gathered, and while it rang, the way stayed open.",
      tags: [SILENT_BELLS],
    },
    {
      text: "When a bell stopped, the mist took the road below it within a day, and nobody could say where it went.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin had grown up thinking that silence was something you had to make, like bread.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "The bell-cotes along the old roads were empty now, or held bells with their tongues rusted fast.",
      tags: [SILENT_BELLS],
    },
    {
      text: "People said a silent bell was worse than no bell at all, because it reminded you.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Every silent bell they passed, Tamsin touched, the way some people touch a doorframe for luck.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "A bell that has been silent a long time goes dull on the outside and green in the mouth.",
      tags: [SILENT_BELLS],
    },
    {
      text: "The wardens used to ring the road bells at dawn, noon and dusk, and travellers set their walking by them.",
      tags: [SILENT_BELLS],
    },
    {
      text: "In the valleys people still stopped at noon from habit, listening for a bell that did not come.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin could tell a silent bell's note just by looking at its shape, and it hurt to know it.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "Some bells had been taken down and sold for their bronze, and only the hooks were left.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Nobody could remember exactly when the bells began to fail, only that it had been going on for years.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A bell rope with no bell at the end of it swung in the wind and knocked against the wall.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Where the bells had stopped, the farms had stopped too, one field at a time.",
      tags: [SILENT_BELLS],
    },
    {
      text: "The silence of a valley without bells is not empty, Tamsin thought; it is full of waiting.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "The old road bells were cast with the name of their road around the shoulder, and some could still be read.",
      tags: [SILENT_BELLS],
    },
    {
      text: "On every silent bell Tamsin found the same thing: a tongue gone soft, or cracked, or false.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "A false tongue rings, but it rings wrong, and the mist does not listen to it.",
      tags: [SILENT_BELLS],
    },
    {
      text: "She wondered who had rung each bell last, and whether they had known it was the last time.",
      tags: [SILENT_BELLS],
    },
    {
      text: "In the villages the bells were mended with wire and string and prayer, and none of it held.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A bell that rings flat is a bell that is failing, and every founder knows it before the ringer does.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin counted the silent bells as they went, and soon stopped saying the number aloud.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "Nobody had counted the road bells in years, because nobody wanted to know the number.",
      tags: [SILENT_BELLS],
    },
    {
      text: "The bells nearest the cities went first, people said, because the cities had stopped listening.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A silent bell still has its note inside it, Tamsin's master used to say, the way a seed has its tree.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "Swallows nested in some of the silent belfries, under bells that had not moved in years.",
      tags: [SILENT_BELLS],
    },
    {
      text: "When the wind blew hard enough, a silent bell would hum, and Tamsin always stopped to listen.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "Some of the bells had been silent so long that the villages under them had forgotten their names.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A road without a bell was a road that ended wherever the mist decided.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin learned that people grieved for their bells as they grieved for their old dogs, quietly and for years.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "At one farm a bell lay in the grass where it had fallen, and the grass had grown up through its mouth.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Every belfry had a ledge for the ringer's lamp, and every ledge was black with old smoke.",
      tags: [SILENT_BELLS],
    },
    {
      text: "The bells along the road were all sizes, from a hand-bell on a post to a great bell in a tower.",
      tags: [SILENT_BELLS],
    },
    {
      text: "In some valleys the people hummed the note of their lost bell when they worked, so as not to forget it.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A good bell can be heard three valleys away, and a silent one is not heard even under it.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin thought that the bells had not so much failed as been let go of, one at a time.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "There were stories of bells that had rung by themselves the night before they cracked.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Most of the silent bells needed nothing but a true tongue and someone to ring them.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Each bell they passed had been cast by somebody, and Tamsin found herself wondering who.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "A ringer's rope wears smooth where the hands go, and these ropes were rough with lichen.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Bells went silent from the road's end inwards, like lamps put out by someone walking home.",
      tags: [SILENT_BELLS],
    },
    {
      text: "People in the valleys still swept under their bell-towers, out of habit or of hope.",
      tags: [SILENT_BELLS],
    },
    {
      text: "The silence had come so slowly that most people had not noticed until it was nearly complete.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin knew the note of every bell in her own valley, and now she knew the shape of their silence too.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "A bell is only bronze until someone rings it, her master said, and after that it is a promise.",
      tags: [SILENT_BELLS],
    },
    {
      text: "In one village a child rang a silent bell with a stick every evening, and nothing happened, and he did it anyway.",
      tags: [SILENT_BELLS],
    },
    {
      text: "The bell-cotes on the high roads were roofed with slate, and the slate had kept the bells dry and useless.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Where a bell still rang, the grass on the road was trodden flat, and where it did not, the road was green.",
      tags: [SILENT_BELLS],
    },
    {
      text: "There was a saying among the wardens that a valley dies from the bell down.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin had heard bells all her life and never once thought about what it would be to lose them.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "A cracked bell can sometimes still be rung, gently, but it cannot hold back much.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Outside one cottage an old bell hung upside down from a post, put to use as a water trough.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Some of the old road bells had been stolen, and their thieves had found that bronze is heavy.",
      tags: [SILENT_BELLS],
    },
    {
      text: "In the evenings the silence was loudest, when the bells should have rung the day closed.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A wayside bell was hung low enough for a child to reach, because anyone might need the road.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Tamsin noticed that birds did not sing near a silent bell, though they sang well enough near a ringing one.",
      tags: [SILENT_BELLS, TAMSIN],
    },
    {
      text: "The oldest bells carried a small mark inside the lip, a ring with a line through it, the mark of the Founding.",
      tags: [SILENT_BELLS],
    },
    {
      text: "People who had lost their bell spoke more softly, as if the silence might hear them.",
      tags: [SILENT_BELLS],
    },
    {
      text: "A ringing bell and a silent one look the same from the road, which is why travellers had stopped trusting either.",
      tags: [SILENT_BELLS],
    },
    {
      text: "Bell bronze is four parts copper to one of tin, and every founder argues about the fifth part.",
      tags: [CRAFT],
    },
    {
      text: "A bell is shaped first in loam on a turning board, the strickle, and the shape decides the note.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin Hale could hear a quarter-tone flat from across a yard, and had never been able to stop hearing it.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "The clapper, which ringers call the tongue, must be softer than the bell or it will crack the lip.",
      tags: [CRAFT],
    },
    {
      text: "Her master said the tongue gives a bell its voice, and the bronze only gives it somewhere to speak from.",
      tags: [CRAFT],
    },
    {
      text: "A bell is hung from its yoke by the crown, and the yoke must be oak, seasoned for years.",
      tags: [CRAFT],
    },
    {
      text: "Tuning a bell means taking metal away from the inside with a file, a shaving at a time.",
      tags: [CRAFT],
    },
    {
      text: "You can make a bell lower but never higher, her master said, so you had better start high.",
      tags: [CRAFT],
    },
    {
      text: "In the founding pit the mould is buried in earth so that it does not burst when the bronze goes in.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin had burned her hands so often that the palms were smooth and shiny as horn.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "A peal is all the notes of a bell at once, and a good founder hears each one separately.",
      tags: [CRAFT],
    },
    {
      text: "Bronze goes into the mould at a dull orange, and a founder can judge its heat by eye alone.",
      tags: [CRAFT],
    },
    {
      text: "The hum of a bell lasts longest, and Tamsin always listened for it after everyone else had stopped.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "A cracked bell can be heard before it is seen, in the buzz under its note.",
      tags: [CRAFT],
    },
    {
      text: "Her master kept his tuning forks in a velvet roll and let nobody touch them, not even Tamsin.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "Loam for a mould is clay, sand, horse dung and goat hair, and it smells exactly like that.",
      tags: [CRAFT],
    },
    {
      text: "The thickness of the lip decides how loud a bell can ring before it breaks.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin had cast her first hand-bell at nine, and it had rung like a dropped pan.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "A founder never strikes a cooling bell, because a sudden note can crack it from the inside.",
      tags: [CRAFT],
    },
    {
      text: "The strike note, the hum and the tierce must agree, or a bell sounds sour however loud it rings.",
      tags: [CRAFT],
    },
    {
      text: "Founders sign their bells inside the lip, where only another founder will think to look.",
      tags: [CRAFT],
    },
    {
      text: "Bell metal is for ringing, not polishing, her master said; shine is for spoons.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin could tell where a bell had been cast by its tone, the way some people can tell a valley by its cheese.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "The clapper hangs from a leather strap inside the crown, and the leather must be renewed every year.",
      tags: [CRAFT],
    },
    {
      text: "A bell rung too hard for too long grows tired, and a tired bell cracks.",
      tags: [CRAFT],
    },
    {
      text: "The founder's first lesson is to listen, the second is to wait, and the third is to burn yourself and learn.",
      tags: [CRAFT],
    },
    {
      text: "A tongue too heavy for its bell will ring loud for a season and then split the bell's lip.",
      tags: [CRAFT],
    },
    {
      text: "Bronze remembers every mistake in its mould, and a bell tells everyone about them for a hundred years.",
      tags: [CRAFT],
    },
    {
      text: "A bell cast in a cold pit will ring cold, the old founders said, and nobody knew quite what they meant.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin knew the weight of every bell in her master's yard by the sound it made when she knocked it.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "The crown of a bell takes the strain, and the loops on top of it are where it is hung.",
      tags: [CRAFT],
    },
    {
      text: "Every founder has a mark, and Tamsin had been practising hers on scraps of slate for years.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "A bell must be turned a little in its yoke every few years, so the tongue strikes fresh metal.",
      tags: [CRAFT],
    },
    {
      text: "Her master tuned by ear and checked by fork, and was annoyed whenever the fork disagreed.",
      tags: [CRAFT],
    },
    {
      text: "A bell's note is set by its size and the thickness of its waist, and nothing else can be argued with.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin liked the smell of a cold foundry best, iron and ash and old wax.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "The best bell-tongues were forged from soft iron, drawn out by hand and balanced like a dancer.",
      tags: [CRAFT],
    },
    {
      text: "A true tongue is one that strikes a bell's sound bow exactly, every time, without thought.",
      tags: [CRAFT],
    },
    {
      text: "There was a song founders sang while they worked the bellows, and it had no words, only breaths.",
      tags: [CRAFT],
    },
    {
      text: "Founders count in strokes, not minutes, and Tamsin did it without noticing.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "You can hear the bronze settle in a mould as it cools, a tick and a creak like an old house.",
      tags: [CRAFT],
    },
    {
      text: "A bell can be recast, but it will never be the same bell, only a new one with the old bronze.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin's master said a bell should be rung once, gently, before it is hung, to wake it.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "The tierce is the note that makes a bell sound sad, and the old founders made it so on purpose.",
      tags: [CRAFT],
    },
    {
      text: "A bell hung crooked rings crooked, and no amount of tuning will mend it.",
      tags: [CRAFT],
    },
    {
      text: "Wax letters are pressed into the mould for the inscription, one at a time, back to front.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin had learned to read back to front before she could read the right way round.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "The best loam was dug from the river bend below the foundry and left to rot all summer.",
      tags: [CRAFT],
    },
    {
      text: "Founders talk about bells the way farmers talk about cattle, fondly and without illusions.",
      tags: [CRAFT],
    },
    {
      text: "A bell's voice comes from its sound bow, the thick ring near the lip where the tongue strikes.",
      tags: [CRAFT],
    },
    {
      text: "Clappers wear a dent where they strike, and a careful ringer knows when the dent has gone deep enough to matter.",
      tags: [CRAFT],
    },
    {
      text: "It takes a day and a night to fire a mould dry, and someone must sit up with it the whole time.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin's master could cast a bell in a week, and spend a year deciding whether to.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "Every bell rings a little differently in frost, and a good founder tunes for the coldest night.",
      tags: [CRAFT],
    },
    {
      text: "Bronze is poured in one go; if the pour stops, the bell is lost and the pit must be dug again.",
      tags: [CRAFT],
    },
    {
      text: "A founder's hands are always cut, always burned and always clean, for the bronze will show any dirt.",
      tags: [CRAFT],
    },
    {
      text: "Tamsin judged a peal by whether she wanted to hear it again, which her master said was the only test.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "The yoke of a big bell is the work of a carpenter, and founders and carpenters never agree.",
      tags: [CRAFT],
    },
    {
      text: "Some founders whispered into the mould before the pour, and Tamsin's master pretended not to.",
      tags: [CRAFT, TAMSIN],
    },
    {
      text: "A bell's first note out of the pit is never its true one; it has to be found with a file.",
      tags: [CRAFT],
    },
    {
      text: "A woman at a farm gate handed out a jug of milk without being asked and would not take it back until it was empty.",
      tags: [KINDNESS],
    },
    {
      text: "Strangers shared bread on the road more easily than neighbours did at home, Tamsin noticed.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "Somebody had left a pile of dry kindling under the eaves of a barn, with a stone on top to keep it there.",
      tags: [KINDNESS],
    },
    {
      text: "A man mending a wall stopped to point out the safe way round the bog, and then walked them half of it.",
      tags: [KINDNESS],
    },
    {
      text: "Tamsin gave her last apple to a child who had been staring at it, and did not regret it until supper.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "At one cottage they were given a dry corner and a blanket that smelled of sheep and smoke.",
      tags: [KINDNESS],
    },
    {
      text: "An old woman sewed up the tear in Tamsin's sleeve while they talked, and never once looked at her needle.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "A carter going the other way gave them a ride a mile back the way they had come, out of pure goodwill.",
      tags: [KINDNESS],
    },
    {
      text: "Somebody had carved arrows into the stones at a fork in the road, so that travellers would not need to ask.",
      tags: [KINDNESS],
    },
    {
      text: "A boy brought them hot potatoes in his cap, burned his fingers, and pretended he had not.",
      tags: [KINDNESS],
    },
    {
      text: "People with almost nothing gave them almost all of it, and would not be argued with.",
      tags: [KINDNESS],
    },
    {
      text: "At a mill the miller let them sleep among the sacks, where it was warm and dusty and smelled of bread.",
      tags: [KINDNESS],
    },
    {
      text: "A shepherd shared his fire and his silence, and both were good.",
      tags: [KINDNESS],
    },
    {
      text: "Tamsin learned to say thank you in the way of each valley, because each valley said it differently.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "An innkeeper's wife wrapped hot stones in cloth for their beds and asked nothing for it.",
      tags: [KINDNESS],
    },
    {
      text: "A girl Tamsin's age gave her a pair of dry stockings and a look that said not to mention it.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "Someone had mended the footbridge with new planks, and nailed a board to it that said to mind the third one.",
      tags: [KINDNESS],
    },
    {
      text: "At a farm they were given soup so thick the spoon stood up in it.",
      tags: [KINDNESS],
    },
    {
      text: "Kindness on the road was plain and quick, like a hand at the elbow on a slippery step.",
      tags: [KINDNESS],
    },
    {
      text: "A woman who had lost her own bell rang a cooking pot for them as they left, so they would have something.",
      tags: [KINDNESS],
    },
    {
      text: "Tamsin found a heel of bread in her coat pocket that somebody had put there without telling her.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "An old warden on the road gave them his gloves and walked home with his hands in his armpits.",
      tags: [KINDNESS],
    },
    {
      text: "People asked where they were going, heard the answer, and gave them food instead of advice.",
      tags: [KINDNESS],
    },
    {
      text: "A child walked beside them for a mile to show them a spring nobody else knew about.",
      tags: [KINDNESS],
    },
    {
      text: "The kindest thing anyone did all week was to say nothing when Tamsin cried.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "At one door they were turned away, and the woman ran after them five minutes later with a loaf.",
      tags: [KINDNESS],
    },
    {
      text: "A farmer lent them his barn and his dog, and the dog slept across the door all night.",
      tags: [KINDNESS],
    },
    {
      text: "Tamsin mended a cowbell for a woman who had no money, and the woman paid her in honey.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "An old man told them which way the weather would turn, and he was right, and they were grateful.",
      tags: [KINDNESS],
    },
    {
      text: "Somebody had left a lantern burning in the window of an empty house, for whoever came by in the dark.",
      tags: [KINDNESS],
    },
    {
      text: "A potter gave Tamsin a cup with a crooked handle, because it was the one he was proudest of.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "In a village with no bell left, the people walked them to the edge of the mist and waited until they were through.",
      tags: [KINDNESS],
    },
    {
      text: "Tamsin carried a woman's basket up a hill, and the woman told her stories the whole way, which was its own payment.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "People who had lost their bells had not lost their manners, and fed travellers out of old habit.",
      tags: [KINDNESS],
    },
    {
      text: "A stranger stitched the strap of Tamsin's pack where it had begun to fray, and wished her a dry road.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "Tamsin gave away her spare bootlace to a man whose boots were held together with grass.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "A family of seven moved up on their bench by the fire to make room for one more.",
      tags: [KINDNESS],
    },
    {
      text: "At a ford a woman held Tamsin's pack while she crossed, and then handed it over without a word.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "Someone had cut steps into a muddy bank with a spade, and the steps were still sharp.",
      tags: [KINDNESS],
    },
    {
      text: "A baker gave them yesterday's loaves, and they were the best bread Tamsin had ever eaten.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "Kindnesses came from people who had least reason to trust them, and Tamsin tried to remember every face.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "A woman with a bad cough insisted on giving up her bed, and slept in her chair by choice.",
      tags: [KINDNESS],
    },
    {
      text: "Tamsin found that she was kinder on the road than she had been at home, and did not know why.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "A herdsman told them the name of every hill in sight, and asked them to say the names back to him.",
      tags: [KINDNESS],
    },
    {
      text: "A blacksmith straightened the buckle on Tamsin's pack between two horseshoes and waved away her coin.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "Small kindnesses kept them going longer than food did, though food helped.",
      tags: [KINDNESS],
    },
    {
      text: "An old couple sat up with a candle so that the travellers would not wake in the dark in a strange house.",
      tags: [KINDNESS],
    },
    {
      text: "A boy gave Tamsin a smooth stone for her pocket, for luck, and she kept it to the end.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "People in the valleys pressed things on them at every door: onions, socks, a spoon, advice.",
      tags: [KINDNESS],
    },
    {
      text: "Tamsin learned to accept a kindness without arguing, which her master said was the hardest thing.",
      tags: [KINDNESS, TAMSIN],
    },
    {
      text: "The Hush was not a fog but a silence that had learned to move, and the mist only came with it.",
      tags: [HUSH],
    },
    {
      text: "Inside the Hush a dropped stone made no sound, and a shout was a mouth opening and closing.",
      tags: [HUSH],
    },
    {
      text: "The mists came down the roads in the afternoon and lay there, thick and white, until a bell drove them off.",
      tags: [HUSH],
    },
    {
      text: "People who walked into the Hush came out again sometimes, days later, unable to say where they had been.",
      tags: [HUSH],
    },
    {
      text: "The Hush had been spreading for years, valley by valley, so slowly that each valley thought it was alone.",
      tags: [HUSH],
    },
    {
      text: "Tamsin hated the Hush more than the cold, because the cold at least made a noise in the trees.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "The mists never rose higher than the bells could reach, and Tamsin wondered who had first found that out.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "In the Hush, footsteps stopped being footsteps and became a pressure in the knees.",
      tags: [HUSH],
    },
    {
      text: "The Hush did not come in a wall but in fingers, feeling along the low places first.",
      tags: [HUSH],
    },
    {
      text: "Edges went soft in the mists: walls, faces, the line of the road, even your own hands held out in front.",
      tags: [HUSH],
    },
    {
      text: "Some said the Hush was only weather, and others said it was something older, and nobody had proved either.",
      tags: [HUSH],
    },
    {
      text: "Where the Hush had lain, frost formed in strange lines, as if something had been written and rubbed out.",
      tags: [HUSH],
    },
    {
      text: "A bell rung into the mists opened them the way a hand opens a curtain, and they closed again behind it.",
      tags: [HUSH],
    },
    {
      text: "Tamsin learned to walk in the mist by counting steps and touching the road's edge with her foot.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "The Hush took sound first, then the road, then the way back.",
      tags: [HUSH],
    },
    {
      text: "Out on the edge of the Hush, sounds seemed to come from everywhere and nowhere at once.",
      tags: [HUSH],
    },
    {
      text: "Mist beaded on Tamsin's eyelashes and on the wool of her coat like tiny bells that would not ring.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "Nobody in the valleys said the word Hush after dark, which Tamsin had thought a silly custom until now.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "The mists moved against the wind, and that, more than anything, told Tamsin they were not ordinary.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "In the Hush you could not hear your own heart, and that was the worst of it.",
      tags: [HUSH],
    },
    {
      text: "The mist lay on the river so thick that the water could be heard on one side of it and not the other.",
      tags: [HUSH],
    },
    {
      text: "When the Hush lifted from a place, it left the grass flattened and the birds confused.",
      tags: [HUSH],
    },
    {
      text: "There were villages so deep in the Hush that their people had learned to talk by tapping.",
      tags: [HUSH],
    },
    {
      text: "A thin mist came up the road at their backs all day, never closer, never farther.",
      tags: [HUSH],
    },
    {
      text: "Tamsin found that she was holding her breath whenever the mist touched her, as if it might take that too.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "The Hush made the world look far away even when it was close enough to touch.",
      tags: [HUSH],
    },
    {
      text: "At the edge of the mist the air was always colder, and tasted faintly of iron.",
      tags: [HUSH],
    },
    {
      text: "The old wardens said that the Hush was patient, and that patience was the only thing that could beat it.",
      tags: [HUSH],
    },
    {
      text: "Mist filled the valley below to the brim, and the tops of the hills stood out of it like islands.",
      tags: [HUSH],
    },
    {
      text: "Sometimes the Hush withdrew for an hour for no reason, and the birds all sang at once in relief.",
      tags: [HUSH],
    },
    {
      text: "Where the Hush had been, the bells were always found silent, as though it had drunk their voices.",
      tags: [HUSH],
    },
    {
      text: "In the mists a lantern became a smear of light that could have been a mile off or an arm's length.",
      tags: [HUSH],
    },
    {
      text: "Tamsin had once believed the Hush was a story to keep children near home.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "The mists left a fine grey dew on everything they touched, which dried to dust.",
      tags: [HUSH],
    },
    {
      text: "The Hush was worst at dusk, when it rose out of the ground like breath on a cold morning.",
      tags: [HUSH],
    },
    {
      text: "People said the bells had held the Hush back for longer than anyone could count, and that the bells were tired.",
      tags: [HUSH],
    },
    {
      text: "The silence in the mist was so complete that Tamsin began to hear the blood in her own ears.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "A shout into the Hush came back as nothing, not even an echo, and that was how you knew.",
      tags: [HUSH],
    },
    {
      text: "Fear in the mist was quiet too, a cold hand in the stomach and nothing to say about it.",
      tags: [HUSH],
    },
    {
      text: "The Hush crept into houses under the doors, and people stuffed rags in the gaps and rang spoons on pans.",
      tags: [HUSH],
    },
    {
      text: "No one had ever seen the Hush arrive, only found it already there in the morning.",
      tags: [HUSH],
    },
    {
      text: "The mists made a road disappear in front of you and reappear behind, which was worse.",
      tags: [HUSH],
    },
    {
      text: "Tamsin began to feel the Hush before she saw it, a pressure in the ears like going down a well.",
      tags: [HUSH, TAMSIN],
    },
    {
      text: "Where the mists had swallowed a road, the milestones still stood, numbering a way nobody could walk.",
      tags: [HUSH],
    },
    {
      text: "The road went up and up, and every time Tamsin thought she had reached the top, there was more of it.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "Her boots had been new when she left, and now they had opinions about every stone.",
      tags: [ROAD],
    },
    {
      text: "They walked from first light until the light went, and ate walking, and talked little.",
      tags: [ROAD],
    },
    {
      text: "A milestone every mile told them how far they had come, if they could read it through the moss.",
      tags: [ROAD],
    },
    {
      text: "Blisters came and broke and hardened, and by the end of the first week Tamsin had stopped noticing them.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "The road was older than any of them, laid by hands that had known where it was going.",
      tags: [ROAD],
    },
    {
      text: "Walking all day made thinking easier, Tamsin found, and remembering harder.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "Some days the road was a cart track, some days a goat path, and some days only a guess.",
      tags: [ROAD],
    },
    {
      text: "Every evening they looked back the way they had come and could not believe it.",
      tags: [ROAD],
    },
    {
      text: "There is a rhythm to a long walk that settles into the bones, and after a while Tamsin walked in her sleep.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "The road crossed streams on stepping stones, on fallen trees, and once on a gate laid flat.",
      tags: [ROAD],
    },
    {
      text: "Tamsin learned the shapes of other people's walking: who limped, who hurried, who stopped to look.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "Along the old road the walls were built without mortar, each stone chosen to fit the next.",
      tags: [ROAD],
    },
    {
      text: "A long day's walking left her too tired to be frightened, which was a mercy.",
      tags: [ROAD],
    },
    {
      text: "They passed carts going the other way, loaded with everything a family owned.",
      tags: [ROAD],
    },
    {
      text: "Walking uphill in wet weather, Tamsin discovered, is mostly a matter of not stopping.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "The road kept to the high ground where it could, because the old builders had known about the mists.",
      tags: [ROAD],
    },
    {
      text: "At every fork Tamsin chose the road that climbed, because what she needed was at the top of the world.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "Her pack straps wore two red lines into her shoulders that never quite faded.",
      tags: [ROAD],
    },
    {
      text: "They measured the days in miles, and the miles in meals, and the meals were getting smaller.",
      tags: [ROAD],
    },
    {
      text: "A road walked is a different thing from a road drawn, Tamsin thought, and both are true.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "There were wayside shrines every few miles with a stone basin for water and a hook for a bell.",
      tags: [ROAD],
    },
    {
      text: "The road narrowed until it was only as wide as a pair of boots.",
      tags: [ROAD],
    },
    {
      text: "In the mornings the walking was easy, and by afternoon every step had to be argued for.",
      tags: [ROAD],
    },
    {
      text: "Tamsin's legs grew strong on the road, and her patience, to her surprise, grew a little longer.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "Once a day, at least, the road did something Tamsin had not expected, and she began to look forward to it.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "The road dipped through woods where the trees met overhead and the light came green.",
      tags: [ROAD],
    },
    {
      text: "Every traveller they met asked the same three questions: where from, where to, and is it ringing.",
      tags: [ROAD],
    },
    {
      text: "At night by the fire they took off their boots, and nobody said anything about the smell.",
      tags: [ROAD],
    },
    {
      text: "Tamsin counted her steps in hundreds, and the hundreds in bells she would cast one day.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "The old road had been paved once, and here and there the paving came up through the turf like bones.",
      tags: [ROAD],
    },
    {
      text: "There was always another ridge, and on the other side of it there was always another road.",
      tags: [ROAD],
    },
    {
      text: "They walked in single file on the narrow places and side by side on the wide, and the wide were rare.",
      tags: [ROAD],
    },
    {
      text: "A rest by the road was ten breaths long, never twenty, or the cold got in.",
      tags: [ROAD],
    },
    {
      text: "The road had been made for bells to be carried along it, wide enough for a cart and a team.",
      tags: [ROAD],
    },
    {
      text: "The signposts at the crossroads had been turned by wind or by mischief, and pointed every way but true.",
      tags: [ROAD],
    },
    {
      text: "Tamsin got used to waking up stiff and walking until the stiffness went, about a mile.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "They shared the road with crows, which walked on it too and seemed to think it was theirs.",
      tags: [ROAD],
    },
    {
      text: "The best part of the day was the first hour, when the road was new and nothing yet hurt.",
      tags: [ROAD],
    },
    {
      text: "When the road was easy, Tamsin hummed the valley bell's note under her breath, so she would not lose it.",
      tags: [ROAD, TAMSIN],
    },
    {
      text: "The tongue weighed as much as a small child and was a great deal less comfortable to carry.",
      tags: [TONGUE],
    },
    {
      text: "Tamsin carried the bell-tongue on her back in its oiled sacking, strapped tight so it would not knock.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "At night she slept with one hand on the tongue, and once woke to find she had been holding it in a dream.",
      tags: [TONGUE],
    },
    {
      text: "If she struck the tongue lightly with a knuckle, it gave a note so true that her teeth hummed.",
      tags: [TONGUE],
    },
    {
      text: "The last true bell-tongue in the land was a plain iron bar with a bulb at one end, and nobody would have looked at it twice.",
      tags: [TONGUE],
    },
    {
      text: "Tamsin unwrapped the tongue every evening to check it for rust and wrapped it again in fresh oil.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "The weight of the tongue changed during the day: light at dawn, heavy at noon, impossible by dusk.",
      tags: [TONGUE],
    },
    {
      text: "She did not let anyone else carry the tongue, though everyone offered, because it had been given to her.",
      tags: [TONGUE],
    },
    {
      text: "The tongue rubbed a raw place between her shoulder blades that never healed on the road.",
      tags: [TONGUE],
    },
    {
      text: "Mist drew back a little from the tongue, even wrapped, as water draws back from a hot stone.",
      tags: [TONGUE],
    },
    {
      text: "When she was frightened, Tamsin put her hand behind her and touched the tongue through the sacking.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "The tongue's note was the note every road bell had been cast to answer, her master had said.",
      tags: [TONGUE],
    },
    {
      text: "Tamsin had never been trusted with anything so precious, and it made her careful in a way she did not like.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "People along the road stared at the bundle on her back and were too polite to ask what it was.",
      tags: [TONGUE],
    },
    {
      text: "The iron of the tongue was always colder than the air, even after a day against her back.",
      tags: [TONGUE],
    },
    {
      text: "She worried about the tongue on every crossing, every ledge, every night in a strange house.",
      tags: [TONGUE],
    },
    {
      text: "Some nights the tongue hummed by itself in the dark, so faintly that only Tamsin could hear it.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "The tongue had a founder's mark stamped on its shank, too worn to read.",
      tags: [TONGUE],
    },
    {
      text: "Tamsin practised taking the tongue off and putting it back on in the dark, until she could do it in a breath.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "In the rain the sacking grew heavy, and the tongue grew heavier with it.",
      tags: [TONGUE],
    },
    {
      text: "The tongue made Tamsin walk straighter, because if she stooped, it pulled her over backwards.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "Every silent bell they passed made the tongue on her back feel heavier.",
      tags: [TONGUE],
    },
    {
      text: "She talked to the tongue sometimes, under her breath, as her master talked to the furnace.",
      tags: [TONGUE],
    },
    {
      text: "The tongue's sacking smelled of linseed and iron and, after a while, of Tamsin.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "There was only one true tongue left, and she was carrying it, and the thought kept her awake.",
      tags: [TONGUE],
    },
    {
      text: "Tamsin knew that if she fell with the tongue, it would be the tongue that survived.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "The strap of the tongue's sling was mended so many times that it was more knot than leather.",
      tags: [TONGUE],
    },
    {
      text: "Whoever had forged the tongue had balanced it perfectly; it hung straight from one finger.",
      tags: [TONGUE],
    },
    {
      text: "When she struck the tongue on a bad day, its note told her that the world was still in tune somewhere.",
      tags: [TONGUE],
    },
    {
      text: "Holding the tongue, Tamsin felt like a person carrying a lamp through a house where everyone was asleep.",
      tags: [TONGUE, TAMSIN],
    },
    {
      text: "The last leaves were coming down off the birches, yellow and wet, and they stuck to everything.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Sleet came at dusk most days now, and the mornings were white with hoar frost.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "The first snow of the year fell while they slept and was gone by noon, a warning.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Bracken on the hills had turned the colour of rust, and the rowans were bare.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Geese went over in long lines, calling, the only loud thing in the sky.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "The days were shortening fast, and every evening came a little earlier than they wanted.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Snow lay on the tops now and did not melt, and every day it came a little lower.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "The puddles froze at night and thawed at noon, and the road was either iron or porridge.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Autumn in the mountains is short, and they could feel it ending around them.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "A wet snow fell all afternoon, and Tamsin's coat grew a white shoulder on the windward side.",
      tags: [FIRST_SNOWS, TAMSIN],
    },
    {
      text: "The hawthorns were heavy with berries, and the birds were stripping them in a hurry.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Tamsin had never seen snow so early in the year, and up here it was already common.",
      tags: [FIRST_SNOWS, TAMSIN],
    },
    {
      text: "The streams ran high and cold with the first meltwater off the tops.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Woodsmoke hung over the farms in the evening, and every farm was getting its wood in.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "The cattle had been brought down from the high pastures, and the empty summer huts had their doors tied shut.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Frost feathered the inside of every window they slept behind.",
      tags: [FIRST_SNOWS],
    },
    {
      text: "Snow lay deep on the high roads, and every step had to be broken before it could be taken.",
      tags: [WINTER],
    },
    {
      text: "The cold had a sound of its own, a thin ringing in the ears that was not a bell.",
      tags: [WINTER],
    },
    {
      text: "Every ledge grew a fringe of ice, and when the sun touched it, it dripped and froze again.",
      tags: [WINTER],
    },
    {
      text: "Tamsin learned that snow can be too cold to pack, dry as sand and squeaking underfoot.",
      tags: [WINTER, TAMSIN],
    },
    {
      text: "In deep winter the days were barely days at all, a grey interval between two nights.",
      tags: [WINTER],
    },
    {
      text: "The drifts were blue in their hollows and gold on their crests at sunset.",
      tags: [WINTER],
    },
    {
      text: "A blizzard came over the pass in the afternoon, and the world shrank to the length of an arm.",
      tags: [WINTER],
    },
    {
      text: "The stars in a winter sky were so many and so close that Tamsin felt she could hear them.",
      tags: [WINTER, TAMSIN],
    },
    {
      text: "Snow fell on snow for three days, and on the fourth the sky was clear and bitterly cold.",
      tags: [WINTER],
    },
    {
      text: "Frost formed on Tamsin's eyelashes while she walked, and her scarf froze to her mouth.",
      tags: [WINTER, TAMSIN],
    },
    {
      text: "In the deep cold even sound seemed to freeze, and the crunch of boots carried for miles.",
      tags: [WINTER],
    },
    {
      text: "Spindrift blew off the ridges in long white banners.",
      tags: [WINTER],
    },
    {
      text: "The rivers were frozen at the edges and black and fast in the middle.",
      tags: [WINTER],
    },
    {
      text: "Snow had buried the milestones up to their numbers, and then past them.",
      tags: [WINTER],
    },
    {
      text: "Winter on the high road was a matter of keeping warm, keeping dry and keeping going, in that order.",
      tags: [WINTER],
    },
    {
      text: "Tamsin slept in all her clothes and still woke with her feet like stones.",
      tags: [WINTER, TAMSIN],
    },
    {
      text: "Water dripped from every eave, and the gutters ran loud with snowmelt.",
      tags: [THAW],
    },
    {
      text: "The snow went grey and rotten and slid off the roofs in sudden slabs.",
      tags: [THAW],
    },
    {
      text: "Mud came back to the roads, deep and sticky, and everybody's boots were heavy with it.",
      tags: [THAW],
    },
    {
      text: "The first green showed at the foot of the walls, where the sun stayed longest.",
      tags: [THAW],
    },
    {
      text: "Birds came back to the eaves and argued all morning about where to build.",
      tags: [THAW],
    },
    {
      text: "The air turned soft for an hour at noon, and then the cold came back as if to say not yet.",
      tags: [THAW],
    },
    {
      text: "Streams that had been silent under the ice all winter woke up and ran shouting downhill.",
      tags: [THAW],
    },
    {
      text: "A warm wind came up from the south, and the snow on the hills went in a single night.",
      tags: [THAW],
    },
    {
      text: "On the hazels the catkins hung like small grey bells.",
      tags: [THAW],
    },
    {
      text: "The thaw made every path a stream, and every stream a river.",
      tags: [THAW],
    },
    {
      text: "Tamsin opened her window one morning and smelled earth for the first time in months.",
      tags: [THAW, TAMSIN],
    },
    {
      text: "On the lower slopes the lambs were crying, a sound Tamsin had not heard since home.",
      tags: [THAW, TAMSIN],
    },
    {
      text: "Rain fell warm for the first time in the year, and nobody ran from it.",
      tags: [THAW],
    },
    {
      text: "The days were lengthening, and the evenings stayed light long after supper.",
      tags: [THAW],
    },
    {
      text: "Snow lingered only in the north-facing gullies, grey and shrinking.",
      tags: [THAW],
    },
    {
      text: "In the shelter of the walls the primroses came out, pale as butter.",
      tags: [THAW],
    },
    {
      text: "The furnace took a whole night to come to heat, and someone fed it every hour.",
      tags: [CASTING],
    },
    {
      text: "Bronze in the crucible moved like slow fire, bright and heavy and quiet.",
      tags: [CASTING],
    },
    {
      text: "Everyone in the Founding worked the bellows in turns, counting the strokes aloud.",
      tags: [CASTING],
    },
    {
      text: "The heat from the pit could be felt from the stairs, and the stones of the floor grew warm underfoot.",
      tags: [CASTING],
    },
    {
      text: "Hild stood at the furnace mouth with her sleeves rolled up and her eyes narrowed to slits.",
      tags: [CASTING, HILD],
    },
    {
      text: "The pour was over in less time than it takes to say a long prayer, and then there was only waiting.",
      tags: [CASTING],
    },
    {
      text: "Sparks went up the smoke holes like swallows going home.",
      tags: [CASTING],
    },
    {
      text: "After the casting nobody could sleep, and they sat around the pit telling each other it had gone well.",
      tags: [CASTING],
    },
    {
      text: "The bronze for the new bell had been a hundred things before: pots, latches, buckles, a spoon.",
      tags: [CASTING],
    },
    {
      text: "Tamsin's job at the casting was to listen to the bronze, and she listened until her ears ached.",
      tags: [CASTING, TAMSIN],
    },
    {
      text: "The mould was packed in damp earth up to its crown, so that it would hold when the bronze went in.",
      tags: [CASTING],
    },
    {
      text: "People who had never seen a bell cast stood at the back of the Founding and held their breath.",
      tags: [CASTING],
    },
    {
      text: "When the furnace was opened, the light in the Founding turned orange, and every face turned with it.",
      tags: [CASTING],
    },
    {
      text: "A casting cannot be hurried and cannot be stopped, and everyone in Carrow learned that in a day.",
      tags: [CASTING],
    },
    {
      text: "The smell of hot bronze stayed in Tamsin's hair for a week after the casting.",
      tags: [CASTING, TAMSIN],
    },
    {
      text: "The foundry stood at the head of the valley, where the river was fast enough to turn the bellows wheel.",
      tags: [FOUNDRY],
    },
    {
      text: "Tamsin's master had cast bells in the same yard for forty years, and his father for forty before him.",
      tags: [FOUNDRY, TAMSIN],
    },
    {
      text: "The casting floor was black with old sand and smelled of hot metal even when the furnace was cold.",
      tags: [FOUNDRY],
    },
    {
      text: "Moulds stood in rows along the foundry wall like a family waiting to have their likeness taken.",
      tags: [FOUNDRY],
    },
    {
      text: "Her master slept in a chair by the furnace and claimed he could hear the fire's temper through his dreams.",
      tags: [FOUNDRY],
    },
    {
      text: "The foundry yard was full of bells that nobody had come back for, each one a little story.",
      tags: [FOUNDRY],
    },
    {
      text: "Tamsin had come to the foundry at eight with one pair of boots and a perfect ear.",
      tags: [FOUNDRY, TAMSIN],
    },
    {
      text: "In the evenings her master struck his tuning forks one after another, like a man counting his children.",
      tags: [FOUNDRY],
    },
    {
      text: "The valley bell hung in its little house on the hill above the foundry, and the foundry worked by its peals.",
      tags: [FOUNDRY],
    },
    {
      text: "The furnace door was patched with clay so often that nobody remembered what colour it had been.",
      tags: [FOUNDRY],
    },
    {
      text: "Her master's hands were knotted and scarred and could still feel a flaw in a bell before he heard it.",
      tags: [FOUNDRY],
    },
    {
      text: "At the foundry, supper was whatever was in the pot, and the pot was never empty.",
      tags: [FOUNDRY],
    },
    {
      text: "The foundry's bellows wheel turned day and night in the millrace, and its creak was the first sound Tamsin heard every morning.",
      tags: [FOUNDRY, TAMSIN],
    },
    {
      text: "Behind the foundry was a loam pit, a clay heap and a shed full of strickle boards, each one cut for a bell long gone.",
      tags: [FOUNDRY],
    },
    {
      text: "Tamsin slept in the loft above the moulding shop, where the warmth of the furnace came up through the boards.",
      tags: [FOUNDRY, TAMSIN],
    },
    {
      text: "Her master's tuning forks hung in a row above the bench, and he dusted them every evening before he dusted anything else.",
      tags: [FOUNDRY],
    },
    {
      text: "The foundry's own bell was a little cracked thing by the door, rung for meals and never mended, because her master liked its voice.",
      tags: [FOUNDRY],
    },
    {
      text: "People from three valleys brought their bells to the foundry on carts, and some of them walked beside the cart the whole way.",
      tags: [FOUNDRY],
    },
    {
      text: "The yard of the foundry was paved with broken moulds, so that every step crunched like walking on biscuits.",
      tags: [FOUNDRY],
    },
    {
      text: "In the foundry the day began with sweeping, because a founder who casts on a dirty floor casts dirty bells.",
      tags: [FOUNDRY],
    },
    {
      text: "Her master had taught her to listen before he taught her to lift, and to lift before he let her near the fire.",
      tags: [FOUNDRY],
    },
    {
      text: "On cold mornings the foundry cat slept on the warm lid of the furnace, and nobody had the heart to move it.",
      tags: [FOUNDRY],
    },
    {
      text: "The foundry kept a book of every bell it had cast, with its weight, its note and the valley it went to.",
      tags: [FOUNDRY],
    },
    {
      text: "Tamsin knew the foundry's book by heart, from the first bell her master's grandfather cast to the last one she had helped pour.",
      tags: [FOUNDRY, TAMSIN],
    },
    {
      text: "Smoke from the foundry chimney could be seen from the pass, and travellers used it to find their way down.",
      tags: [FOUNDRY],
    },
    {
      text: "The foundry stood on the river so that the water could cool the moulds and turn the wheel and wash the founders.",
      tags: [FOUNDRY],
    },
    {
      text: "Her master never spoke while a bell was being poured, and afterwards he always said the same thing: well, that is done.",
      tags: [FOUNDRY],
    },
    {
      text: "Every bell that left the foundry was rung once in the yard, and the whole valley stopped work to listen.",
      tags: [FOUNDRY],
    },
    {
      text: "The mountain road climbed out of the valley in long zigzags, each one a little steeper than the last.",
      tags: [MOUNTAIN_ROAD],
    },
    {
      text: "Halfway up the mountain road a spring came out of the rock into a stone trough, and they drank there.",
      tags: [MOUNTAIN_ROAD],
    },
    {
      text: "The switchbacks of the mountain road had been built for strings of mules, and the mules had been patient.",
      tags: [MOUNTAIN_ROAD],
    },
    {
      text: "From the mountain road Tamsin could see her whole valley at once, small and grey and silent.",
      tags: [MOUNTAIN_ROAD, TAMSIN],
    },
    {
      text: "Pines grew on the lower slopes of the mountain road, and above them only heather and stone.",
      tags: [MOUNTAIN_ROAD],
    },
    {
      text: "The wayside belfries on the mountain road stood every few miles, and none of them rang.",
      tags: [MOUNTAIN_ROAD],
    },
    {
      text: "Above the last pines the mountain road ran along a shelf of rock with nothing on the left but air.",
      tags: [MOUNTAIN_ROAD],
    },
    {
      text: "The high paths were no wider than a goat, and the goats used every inch of them.",
      tags: [HIGH_PATHS],
    },
    {
      text: "Up on the high paths the air was clear of mist, because the goat bells kept it off.",
      tags: [HIGH_PATHS],
    },
    {
      text: "From the high paths the roads below looked like threads dropped on a grey blanket.",
      tags: [HIGH_PATHS],
    },
    {
      text: "The high paths had no milestones, only cairns, and Joss knew every one by name.",
      tags: [HIGH_PATHS, JOSS],
    },
    {
      text: "Wind on the high paths came from every side at once and pulled at the tongue on Tamsin's back.",
      tags: [HIGH_PATHS, TAMSIN],
    },
    {
      text: "On the high paths they walked roped together, and the rope ran from the goats to Joss to Tamsin and on.",
      tags: [HIGH_PATHS, JOSS, TAMSIN],
    },
    {
      text: "Some nights on the high paths the cloud lay below them, and the stars were their only company.",
      tags: [HIGH_PATHS],
    },
    {
      text: "The shepherd's hut was built of stone without mortar and roofed with turf, and it kept out the wind.",
      tags: [HUT],
    },
    {
      text: "Inside the hut there was one bench, one shelf, one kettle and a smell of a hundred years of sheep.",
      tags: [HUT],
    },
    {
      text: "Someone had cut a list of names into the hut's lintel, shepherds who had sheltered there.",
      tags: [HUT],
    },
    {
      text: "In the shepherd's hut they slept in a heap, goats and people, and nobody minded who was which.",
      tags: [HUT],
    },
    {
      text: "The hut's chimney smoked when the wind was in the east, and the wind was always in the east.",
      tags: [HUT],
    },
    {
      text: "A bell hung on a nail by the hut door, small and dented, so that a shepherd could call his flock.",
      tags: [HUT],
    },
    {
      text: "Tamsin added her name to the hut's lintel with the point of her knife, very small, in the corner.",
      tags: [HUT, TAMSIN],
    },
    {
      text: "The silent valley of Aske lay in a deep bowl of hills, and its fields were white with mist every morning.",
      tags: [ASKE],
    },
    {
      text: "In Aske the people talked with their hands, quickly and well, and laughed without sound.",
      tags: [ASKE],
    },
    {
      text: "The great bell of Aske hung in a square tower in the middle of the village, and it had been silent a year.",
      tags: [ASKE],
    },
    {
      text: "Children in Aske had grown up without hearing their own bell, and some of them did not know what it was for.",
      tags: [ASKE],
    },
    {
      text: "Aske's houses were built close together, each wall leaning on the next like tired friends.",
      tags: [ASKE],
    },
    {
      text: "In Aske a knock on a door was the loudest sound of the day, and people jumped at it.",
      tags: [ASKE],
    },
    {
      text: "The people of Aske had learned to milk, mend and marry without saying a word aloud.",
      tags: [ASKE],
    },
    {
      text: "A woman in Aske showed Tamsin the sign for bell: two hands cupped, swinging slowly.",
      tags: [ASKE, TAMSIN],
    },
    {
      text: "The mist lay over Aske all day, thin and white, and the only sound in the valley was the drip of it.",
      tags: [ASKE],
    },
    {
      text: "Aske had a market without criers, where prices were held up on fingers.",
      tags: [ASKE],
    },
    {
      text: "The river Merrin came down from the mountains brown and fast, carrying branches and stones.",
      tags: [MERRIN],
    },
    {
      text: "In spate the Merrin was loud enough to drown out shouting, and they had to talk with their hands.",
      tags: [MERRIN],
    },
    {
      text: "The ford across the Merrin was marked by a bell on a post in midstream, and the post leaned downstream.",
      tags: [MERRIN],
    },
    {
      text: "Alders grew along the Merrin's banks with their roots in the water, and their roots held the banks together.",
      tags: [MERRIN],
    },
    {
      text: "Tamsin had never seen a river that angry, and she watched it the way you watch a dog that might bite.",
      tags: [MERRIN, TAMSIN],
    },
    {
      text: "The far bank of the Merrin was gravel and driftwood and steep, and they climbed it on hands and knees.",
      tags: [MERRIN],
    },
    {
      text: "On the bank of the Merrin someone had left a coil of rope hanging from an alder, for anyone who needed to cross.",
      tags: [MERRIN],
    },
    {
      text: "The noise of the Merrin followed them for a day after they had left it, in their heads.",
      tags: [MERRIN],
    },
    {
      text: "The drove road ran north between low stone walls, wide enough for a herd of cattle, empty for years.",
      tags: [DROVE_ROAD],
    },
    {
      text: "Grass grew thick on the drove road, and their feet left a dark track through the dew.",
      tags: [DROVE_ROAD],
    },
    {
      text: "Along the drove road there were stone pens every few miles where drovers had kept their herds at night.",
      tags: [DROVE_ROAD],
    },
    {
      text: "The drove road was so straight that Tamsin could see the next day's walking ahead of her.",
      tags: [DROVE_ROAD, TAMSIN],
    },
    {
      text: "Drovers' bells used to sound all along the drove road in autumn, a farmer told them, and now there were none.",
      tags: [DROVE_ROAD],
    },
    {
      text: "The new toll-house was built of cut stone, with a slate roof and a barrier painted Carrow's blue.",
      tags: [NEW_TOLL_HOUSE],
    },
    {
      text: "The wardens at the new toll-house wore blue coats with brass buttons and looked at travellers as if counting them.",
      tags: [NEW_TOLL_HOUSE],
    },
    {
      text: "A bell hung over the toll-house door, new and bright, and rang every time the barrier was raised.",
      tags: [NEW_TOLL_HOUSE],
    },
    {
      text: "A board on the toll-house wall listed the tolls, and they were high, and they had been raised twice.",
      tags: [NEW_TOLL_HOUSE],
    },
    {
      text: "The road beyond the new toll-house was swept clean, and the mist lay on either side of it.",
      tags: [NEW_TOLL_HOUSE],
    },
    {
      text: "The Grey Reach was a high, flat moor with no trees and no walls, only heather and stone and sky.",
      tags: [GREY_REACH],
    },
    {
      text: "On the Grey Reach the wind never stopped, and the heather lay flat under it.",
      tags: [GREY_REACH],
    },
    {
      text: "In the middle of the Grey Reach the great cairn stood on a rise, taller than three people.",
      tags: [GREY_REACH],
    },
    {
      text: "The Grey Reach had been crossed by the bell roads once, and their stones still showed through the turf.",
      tags: [GREY_REACH],
    },
    {
      text: "Tamsin had never been anywhere as wide as the Grey Reach, and it made her feel the size of a pin.",
      tags: [GREY_REACH, TAMSIN],
    },
    {
      text: "All over the Grey Reach lay pools of black water, each one holding a little piece of grey sky.",
      tags: [GREY_REACH],
    },
    {
      text: "Nobody lived on the Grey Reach, but people had once crossed it every day.",
      tags: [GREY_REACH],
    },
    {
      text: "The great cairn on the Grey Reach had an old bell in an iron frame on top, its own tongue long gone.",
      tags: [GREY_REACH],
    },
    {
      text: "The founding road ran north from the Grey Reach, steep and short, cut into the side of the mountain.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "Long ago the founding road had carried new bells down from Carrow to every valley in the land.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "The stones of the founding road were worn into two grooves by the wheels of bell carts.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "Here and there along the founding road an old bell-hook stood out from the rock, rusted thin.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "The founding road climbed by steps where it had to, and the steps were deep and uneven.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "There were no farms on the founding road, only ruins, and the ruins were full of birds.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "The founding road had been made by founders, and it went straight where a founder would go.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "On the founding road the silence was older than the Hush, the silence of a road nobody had used.",
      tags: [FOUNDING_ROAD],
    },
    {
      text: "The ruined toll-house had lost half its roof, and snow had drifted across the floor inside.",
      tags: [RUINED_TOLL_HOUSE],
    },
    {
      text: "Swallows had built nests in the rafters of the ruined toll-house, rows of them like pots on a shelf.",
      tags: [RUINED_TOLL_HOUSE],
    },
    {
      text: "On the doorframe of the ruined toll-house someone had scratched tally marks, thousands of them.",
      tags: [RUINED_TOLL_HOUSE],
    },
    {
      text: "A rusted iron box under the toll-house floor held a handful of old coins and a cracked bowl.",
      tags: [RUINED_TOLL_HOUSE],
    },
    {
      text: "The toll-house's old bell rope still hung from the eaves, rotted through halfway up.",
      tags: [RUINED_TOLL_HOUSE],
    },
    {
      text: "Snow fell through the open roof of the ruined toll-house and settled on the hearth beside the fire.",
      tags: [RUINED_TOLL_HOUSE],
    },
    {
      text: "The old wardens' post was a squat stone tower with a stable at its foot and a bell at its top.",
      tags: [WARDENS_POST],
    },
    {
      text: "Two wardens kept the post, an old man and an older woman, and they rang its bell every hour.",
      tags: [WARDENS_POST],
    },
    {
      text: "The wardens' post had a long table, a fire that never went out and a book where every traveller was written.",
      tags: [WARDENS_POST],
    },
    {
      text: "Inside the post the walls were hung with old warden coats, faded from green to grey.",
      tags: [WARDENS_POST],
    },
    {
      text: "The wardens at the post kept a slate by the bell rope and marked off each hour as they rang it.",
      tags: [WARDENS_POST],
    },
    {
      text: "Bread at the wardens' post was baked in the fire's ashes and came out grey on the bottom and good inside.",
      tags: [WARDENS_POST],
    },
    {
      text: "From the top of the wardens' post the founding road could be seen winding north for miles.",
      tags: [WARDENS_POST],
    },
    {
      text: "The forge stood where the founding road crossed a stream, a low stone building with a wide door.",
      tags: [FORGE],
    },
    {
      text: "Inside the forge the anvil stood like a sleeping animal, and the bellows hung slack on the wall.",
      tags: [FORGE],
    },
    {
      text: "Hild's forge had been her grandmother's, and her grandmother's before that, all the way back to the Founding.",
      tags: [FORGE, HILD],
    },
    {
      text: "Scrap iron lay heaped against one wall of the forge, a hill of old hinges, horseshoes and broken tools.",
      tags: [FORGE],
    },
    {
      text: "The stream outside the forge ran under the bridge loud enough to cover a quiet voice.",
      tags: [FORGE],
    },
    {
      text: "Hild's chalk drawings covered the forge floor, bells inside bells, each one a different note.",
      tags: [FORGE, HILD],
    },
    {
      text: "When the forge fire was lit, the whole building breathed, and the snow melted off its roof.",
      tags: [FORGE],
    },
    {
      text: "The forge bell hung over the bridge outside, small and plain, for customers to ring when they came.",
      tags: [FORGE],
    },
    {
      text: "There was a loft in the forge where Hild slept among the rafters, and a ladder she pulled up after her.",
      tags: [FORGE, HILD],
    },
    {
      text: "Tools hung on the forge walls inside their outlines, painted on the stone, so that a missing one showed at once.",
      tags: [FORGE],
    },
    {
      text: "Carrow Height stood on a black crag above the founding road, its walls hung with silent bells.",
      tags: [CARROW],
    },
    {
      text: "The streets of Carrow were clean, quiet and steep, and every door had a bell beside it with no clapper.",
      tags: [CARROW],
    },
    {
      text: "Wardens in blue walked the walls of Carrow day and night, slowly, like people who are never in a hurry.",
      tags: [CARROW],
    },
    {
      text: "Carrow's houses were tall and narrow and built of the same black stone as the crag.",
      tags: [CARROW],
    },
    {
      text: "In Carrow even the children walked carefully, as if they had been told the stones were listening.",
      tags: [CARROW],
    },
    {
      text: "The market of Carrow sold everything a traveller might want, at prices only Carrow could ask.",
      tags: [CARROW],
    },
    {
      text: "From the walls of Carrow the roads could be seen going down into the mists in every direction.",
      tags: [CARROW],
    },
    {
      text: "Carrow had grown rich on its tolls, and its wealth showed in its glass windows and its silence.",
      tags: [CARROW],
    },
    {
      text: "The people of Carrow were polite to strangers in a way that made strangers feel watched.",
      tags: [CARROW],
    },
    {
      text: "Every bell in Carrow had once been cast at the Founding, and every one had been made to keep quiet.",
      tags: [CARROW],
    },
    {
      text: "The Provost's hall was long and warm, with a fire at each end and a table laid for whoever came.",
      tags: [HALL],
    },
    {
      text: "Ledgers lined one wall of the Provost's hall from floor to ceiling, every toll since the Founding went cold.",
      tags: [HALL],
    },
    {
      text: "A great bell hung above the Provost's hall, polished every week and never rung.",
      tags: [HALL],
    },
    {
      text: "Wardens stood at the doors of the Provost's hall with their spears grounded, looking at nothing.",
      tags: [HALL],
    },
    {
      text: "The cabinet in the Provost's hall was oak bound with iron, and it had three locks.",
      tags: [HALL],
    },
    {
      text: "In the Provost's hall the floor was so well swept that Tamsin's muddy boots felt like an apology.",
      tags: [HALL, TAMSIN],
    },
    {
      text: "Supper in the Provost's hall was served on pewter, and nobody spoke until the Provost did.",
      tags: [HALL],
    },
    {
      text: "The Founding was a hall of black stone under Carrow, as high as a church and as cold as a cellar.",
      tags: [FOUNDING],
    },
    {
      text: "In the middle of the Founding the founding pit lay open, wide enough to cast the greatest bell in the land.",
      tags: [FOUNDING],
    },
    {
      text: "The bellows of the Founding were taller than a man, made of oak and leather, and the leather had cracked.",
      tags: [FOUNDING],
    },
    {
      text: "Founders' marks were scratched all over the walls of the Founding, hundreds of them, each one different.",
      tags: [FOUNDING],
    },
    {
      text: "Light came into the Founding through smoke holes in the roof, in long dusty shafts.",
      tags: [FOUNDING],
    },
    {
      text: "The furnace of the Founding was big enough to walk into, and Tamsin did, once, while it was cold.",
      tags: [FOUNDING, TAMSIN],
    },
    {
      text: "The floor of the Founding was worn smooth in paths between the furnace, the pit and the door.",
      tags: [FOUNDING],
    },
    {
      text: "Old tools lay in the Founding where they had been put down a hundred years before, under a skin of dust.",
      tags: [FOUNDING],
    },
    {
      text: "Sound carried strangely in the Founding, so that a whisper at the pit could be heard at the door.",
      tags: [FOUNDING],
    },
    {
      text: "The Founding smelled of cold ash and old wax, the smell of a foundry that has been asleep.",
      tags: [FOUNDING],
    },
    {
      text: "Carrow's bell tower stood on the highest point of the town, above every roof and wall.",
      tags: [BELL_TOWER],
    },
    {
      text: "The stair of the bell tower wound up inside the wall, so narrow that two people could not pass.",
      tags: [BELL_TOWER],
    },
    {
      text: "From the top of Carrow's bell tower every road in the land could be seen, and every mist on them.",
      tags: [BELL_TOWER],
    },
    {
      text: "The bell tower's frame was oak, black with age, and someone had greased its bearings not long ago.",
      tags: [BELL_TOWER],
    },
    {
      text: "Wind blew through the open arches of the bell tower from all four quarters at once.",
      tags: [BELL_TOWER],
    },
    {
      text: "Dame Wenna Coyle walked with a stick she did not need, and used it mostly for pointing and hitting things.",
      tags: [WENNA],
    },
    {
      text: "Wenna had been captain of the road wardens for twenty years and still stood like one.",
      tags: [WENNA],
    },
    {
      text: "Wenna said very little about herself, and what she did say was usually about someone else.",
      tags: [WENNA],
    },
    {
      text: "When Wenna laughed, which was rarely, she laughed with her whole face and then looked annoyed about it.",
      tags: [WENNA],
    },
    {
      text: "Wenna knew every road warden's song and would sing none of them.",
      tags: [WENNA],
    },
    {
      text: "Wenna's stick had a brass ferrule worn thin, and a notch for every year she had kept the roads.",
      tags: [WENNA],
    },
    {
      text: "Wenna slept sitting up with her back to a wall, an old warden's habit she had never lost.",
      tags: [WENNA],
    },
    {
      text: "Tamsin noticed that Wenna always walked on the side nearest the drop.",
      tags: [WENNA, TAMSIN],
    },
    {
      text: "Wenna could tell the hour by the sky and the day by the smell of the wind.",
      tags: [WENNA],
    },
    {
      text: "Wenna treated everyone the same, captains and goatherds, which is to say with great impatience.",
      tags: [WENNA],
    },
    {
      text: "Edric Fay had drawn every road in the land and walked none of them before this one.",
      tags: [EDRIC],
    },
    {
      text: "Edric's maps were beautiful, and very often wrong about which way was up.",
      tags: [EDRIC],
    },
    {
      text: "Edric counted his steps aloud when he was nervous, and he was nervous most of the time.",
      tags: [EDRIC],
    },
    {
      text: "Edric carried his pens in a roll inside his shirt, to keep the ink from freezing.",
      tags: [EDRIC],
    },
    {
      text: "Edric thanked everyone for everything, which was tiring and also somehow kind.",
      tags: [EDRIC],
    },
    {
      text: "Edric could draw a valley after looking at it once, and could not remember where he had left his gloves.",
      tags: [EDRIC],
    },
    {
      text: "Edric's satchel held more paper than food, and nobody let him forget it.",
      tags: [EDRIC],
    },
    {
      text: "When Edric was cold, he talked about distances, as if knowing them would warm him.",
      tags: [EDRIC],
    },
    {
      text: "Edric had a way of looking at a hill as if it had disappointed him personally.",
      tags: [EDRIC],
    },
    {
      text: "Edric was the first of them to say a frightening thing out loud, and the first to laugh afterwards.",
      tags: [EDRIC],
    },
    {
      text: "Joss was eleven and knew the high paths better than anyone alive, because he had walked them with goats since he could walk.",
      tags: [JOSS],
    },
    {
      text: "Joss talked to his goats in a language of his own invention, and the goats seemed to understand it.",
      tags: [JOSS],
    },
    {
      text: "Joss's seven goats each wore a bell, and each bell was a different note, and Joss knew them all by ear.",
      tags: [JOSS],
    },
    {
      text: "Nettle was Joss's lead goat, grey and stubborn, and she went first or not at all.",
      tags: [JOSS],
    },
    {
      text: "Joss slept with the goats, ate with the goats and would, he said, grow old with the goats.",
      tags: [JOSS],
    },
    {
      text: "Joss had a way of appearing beside you without any sound at all, even with seven belled goats behind him.",
      tags: [JOSS],
    },
    {
      text: "Joss gave every hill a name in goat, and some of the names were very rude, Tamsin suspected.",
      tags: [JOSS, TAMSIN],
    },
    {
      text: "When Joss was happy, he hummed, and the goats' bells seemed to hum with him.",
      tags: [JOSS],
    },
    {
      text: "Joss never asked for anything, and when he was given something he looked at it a long time first.",
      tags: [JOSS],
    },
    {
      text: "Joss could milk a goat in the dark, on a ledge, in the wind, and not spill a drop.",
      tags: [JOSS],
    },
    {
      text: "The goats followed Joss without being told, and followed Tamsin only when Joss told them to.",
      tags: [JOSS, TAMSIN],
    },
    {
      text: "Inside the mist even the goats went quiet, and goats are never quiet.",
      tags: [JOSS],
    },
    {
      text: "Brother Ansel had been the last ringer of the silent valley's bell, and had rung it longer than Tamsin had been alive.",
      tags: [ANSEL, TAMSIN],
    },
    {
      text: "Ansel spoke quietly and seldom, as though every word cost him something.",
      tags: [ANSEL],
    },
    {
      text: "Ansel's hands were the hands of a ringer, broad and hard across the palm where the rope ran.",
      tags: [ANSEL],
    },
    {
      text: "At night Ansel sat apart, his hands folded, listening to the dark as if it might ring.",
      tags: [ANSEL],
    },
    {
      text: "Ansel knew the hand speech of Aske and used it even when he could have spoken.",
      tags: [ANSEL],
    },
    {
      text: "When Ansel smiled, it was so small and so rare that everyone pretended not to notice, so as not to frighten it off.",
      tags: [ANSEL],
    },
    {
      text: "Ansel walked at the back of the company always, counting heads without seeming to.",
      tags: [ANSEL],
    },
    {
      text: "Ansel had rung his bell every day for thirty years before the night it split.",
      tags: [ANSEL],
    },
    {
      text: "Hild was a blacksmith by trade and a founder by blood, and she said so to anyone who doubted it.",
      tags: [HILD],
    },
    {
      text: "Hild's grandmother had poured the last bell at the Founding, and Hild had her calipers to prove it.",
      tags: [HILD],
    },
    {
      text: "Hild could draw any bell in chalk after hearing its note, and the drawing was always right.",
      tags: [HILD],
    },
    {
      text: "Hild spoke the way she worked, in short strokes, and expected you to keep up.",
      tags: [HILD],
    },
    {
      text: "Hild's arms were scarred from wrist to elbow, and she said every scar had taught her something.",
      tags: [HILD],
    },
    {
      text: "Hild carried a hammer the way other people carry a walking stick, without noticing.",
      tags: [HILD],
    },
    {
      text: "When Hild was thinking, she drew bells on the nearest surface, and her sleeves were always white with chalk.",
      tags: [HILD],
    },
    {
      text: "Hild had grown up hearing about the Founding the way other children hear about the sea.",
      tags: [HILD],
    },
    {
      text: "Hild did not trust anyone in a blue coat, and said so to their faces.",
      tags: [HILD],
    },
    {
      text: "Hild taught the way her grandmother had, by doing a thing once and then handing you the tool.",
      tags: [HILD],
    },
    {
      text: "Provost Ysolde Vane was kind in the way of someone who had decided long ago exactly how kind to be.",
      tags: [VANE],
    },
    {
      text: "Vane never raised her voice, because in Carrow nobody had ever needed her to.",
      tags: [VANE],
    },
    {
      text: "Vane wrote everything down in a small, neat hand, and forgot nothing that she had written.",
      tags: [VANE],
    },
    {
      text: "Vane believed the valleys should stay silent so that they would always need Carrow, and said it as if it were weather.",
      tags: [VANE],
    },
    {
      text: "The Provost's blue coat was plain, without a single button more than it needed.",
      tags: [VANE],
    },
    {
      text: "Vane listened to every argument to the end, and then did what she had decided before it began.",
      tags: [VANE],
    },
    {
      text: "There was a tiredness in the Provost's face that Tamsin did not understand until much later.",
      tags: [VANE, TAMSIN],
    },
    {
      text: "Vane had been Provost for thirty years and knew the name of every warden on every wall.",
      tags: [VANE],
    },
    {
      text: "Vane kept a sprig of dried heather on her desk, the only untidy thing in the room.",
      tags: [VANE],
    },
    {
      text: "Vane said please and thank you to her wardens, and her wardens would have walked into the mist for her.",
      tags: [VANE],
    },
  ],
});
