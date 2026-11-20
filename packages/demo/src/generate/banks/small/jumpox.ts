// The phrase bank of Jumpox — Spark & Looki, in the voice of the book.
import type { ProseGuide } from "../../guide.ts";

const SPARK = "Spark";
const LOOKI = "Looki";
const JUMPOX = "Jumpox";
const GRAN = "Gran";
const MUM = "Mum";
const DUSTIN = "Mr. Dustin Pann";
const NARRATOR = "the narrator";

const STREET = "Mallow Street";
const SHOP = "Amari Mends";
const PIER = "Marramby pier";
const DEPOT = "the bus depot";
const LIGHTHOUSE = "Marramby Head lighthouse";
const DOWNTHEBACK = "the Downtheback";
const SOCKS = "the Hills of Odd Socks";
const BUTTONS = "the Button River";
const UMBRELLAS = "the Umbrella Forest";
const SPECTACLES = "the Hall of Spectacles";
const BANDSTAND = "the Lost Bandstand";
const OFFICE = "Mr. Dustin Pann's office";
const NOTHING = "the Nothing-Much";

const MISSING_B = "the missing B";
const SWEEP = "the Great Sweep";
const LETTERS = "the six letters";
const SECRET = "Gran's secret";
const LEDGER = "The Book of Missing";
const NOTICING = "Marramby noticing";

export const JUMPOX_GUIDE: ProseGuide = Object.freeze({
  project: "jumpox",
  names: [
    "Spark Amari",
    "Sparks",
    "Looki",
    "Jumpox",
    "Dot",
    "Mr. Dustin Pann",
    "Chief Tidier",
    "Marramby",
    "Marramby Head",
    "Mallow Street",
    "Amari Mends",
    "Downtheback",
    "Finder",
    "Finders",
    "Third Class",
    "The Book of Missing",
    "Great Sweep",
    "Big Look",
    "Nothing-Much",
    "Hills of Odd Socks",
    "Button River",
    "Umbrella Forest",
    "Hall of Spectacles",
    "Lost Bandstand",
    "B",
    "Mrs. Irene Lomax",
    "Mr. Harold Lomax",
    "Mrs. Hester Brindle",
    "Archie Pockett",
    "Mr. Wilf Hobday",
    "Mrs. Nancy Merrow",
    "Rosie Gallimore",
    "Mr. Tom Petherick",
    "Mr. Len Morrish",
    "Miss Agnes Wrenfield",
    "Mr. Cyril Dunmore",
    "Mr. Ernest Fallow",
    "Jenny Quillan",
    "Mrs. Dora Pellingham",
    "Mr. Stanley Hobbins",
    "Ivy Marchbank",
  ],
  style: {
    actionWords: 0,
    dialogueWords: 0,
    sentenceWords: 40,
    banned: [
      /\b(screen|app|internet|online|email|website)\b/i,
      /\bphone\b[^.]*\b(fix|fixes|find|finds|call|calls)\b/i,
      /\b(stupid|idiot|shut up)\b/i,
    ],
  },
  chapters: [
    {
      number: 1,
      title: "The Box Nobody Wanted",
      beats: [
        "On the first Tuesday of the holidays, Spark watched the bin lorry come down Mallow Street from the window seat.",
        "A wooden box with four brass feet hopped away from the lorry along the kerb.",
        "Spark ran out in her socks and told the man in orange that the box was hers.",
        "The brass plate on the front had a gap with two tiny screw holes where a letter had been.",
        "Inside, at the very edge of her eye, sat a small round creature who asked not to be looked at.",
        "Looki explained, very politely, that Jumpox had lost its B and could jump but not box.",
        "Spark offered to make a new B by teatime, and Looki said that lost things have to be found, not replaced.",
        "Jumpox hopped up the step into the shop as if it had always lived there.",
      ],
      ledger: "Box, travelling, with four brass feet. Lost by: Looki. Found.",
      tags: [STREET, SHOP, MISSING_B, LETTERS, LEDGER],
    },
    {
      number: 2,
      title: "Down the Back of Everything",
      beats: [
        "On Wednesday morning Looki explained the Downtheback to Spark over a slice of toast.",
        "Things that slip down the back of sofas, radiators and wardrobes all end up in the Downtheback.",
        "Finders take lost things home, and Looki was the last Finder still working.",
        "He showed Spark The Book of Missing, where every lost thing is written down with the name of whoever lost it.",
        "Jumpox moved into the shop and pretended to be a coal scuttle whenever a customer came in.",
        "Gran glanced sideways at the coal scuttle and kept her thoughts to herself.",
        "Mrs. Hester Brindle came in about her mantel clock and mentioned her silver thimble, gone since the spring.",
        "Looki found the thimble down the back of Gran's counter, where Mrs. Brindle had dropped it months before.",
        "Mrs. Brindle put the thimble on her finger and tapped the counter with it twice, like knocking on a door.",
      ],
      ledger: "Thimble, silver, one. Lost by: Mrs. Hester Brindle. Found.",
      tags: [SHOP, DOWNTHEBACK, SECRET, LEDGER],
    },
    {
      number: 3,
      title: "The Missing B",
      beats: [
        "On Thursday it rained, and Spark spent the morning at the workbench with Jumpox's sprung hinge.",
        "Gran's very small screwdriver, lost for a year, turned up down the back of the workbench.",
        "Spark mended the hinge so well that the lid shut with a clean, proud tock.",
        "She cut a new B from a brass offcut, and Jumpox would not let it near the plate.",
        "Looki said it has to be the real one, because a new B would only be a B and not its B.",
        "Looki turned back a hundred years of pages in The Book of Missing.",
        "The oldest entry in the ledger read: B, brass, one. Lost by: Jumpox.",
        "Gran took her screwdriver back and said she had looked for it every single day.",
        "That night Spark lay awake wondering where a single brass letter goes for a hundred years.",
      ],
      ledger: "Screwdriver, very small, one. Lost by: Gran Amari. Found.",
      tags: [SHOP, MISSING_B, LEDGER],
    },
    {
      number: 4,
      title: "A Very Short Jump",
      beats: [
        "On Saturday Mum slept late after her shift, and Spark, Looki and Jumpox made their first trip.",
        "Jumpox gathered its feet and jumped, very shortly, down the back of Gran's sofa.",
        "The Downtheback began with hills of odd socks, soft underfoot and smelling faintly of drawers.",
        "Beyond the hills ran a slow river of buttons that clicked as it went.",
        "Past the river stood a forest of umbrellas, opening and closing like breathing.",
        "Looki kept apologising to the umbrellas for walking between them.",
        "Spark was looking for one sock in particular: Mum's striped one, the left foot.",
        "Looki found it near the top of the highest hill, where the striped ones go.",
        "Jumpox jumped them home, and the sofa cushion settled as if nothing had happened.",
        "Mum came down at teatime in a pair of matching socks and could not think why she felt so pleased.",
      ],
      ledger:
        "Sock, striped, left foot. Lost by: Mrs. Amari, Spark's mum. Found.",
      tags: [SHOP, DOWNTHEBACK, SOCKS, BUTTONS, UMBRELLAS, LEDGER],
    },
    {
      number: 5,
      title: "The Book of Missing",
      beats: [
        "On Monday Looki sat on the window seat and taught Spark the rule of Finders.",
        "A thing can only be taken home if somebody is still looking for it, even a little.",
        "Things that nobody looks for any more stay down the back for good.",
        "Archie Pockett, aged seven, had been looking for his lucky blue marble under every bed on Mallow Street.",
        "Spark and Looki found it rolling about by itself on the bank of the Button River.",
        "Archie held the marble up to the light and checked that it was still lucky.",
        "Looki crossed it out in the ledger with the pencil he kept behind his ear.",
        "Spark asked how many entries had never been crossed out, and Looki did not answer for a long time.",
      ],
      ledger:
        "Marble, blue, the lucky one. Lost by: Archie Pockett, aged seven. Found.",
      tags: [SHOP, DOWNTHEBACK, BUTTONS, LEDGER],
    },
    {
      number: 6,
      title: "Mrs. Lomax's Spectacles",
      beats: [
        "On the second Wednesday of the holidays, Mrs. Irene Lomax sat on her step with a newspaper she could not read.",
        "She had lost her reading glasses the week Mr. Lomax retired, and had not read a word since.",
        "Spark offered to mend them, and Mrs. Lomax said she would have to find them first.",
        "Jumpox jumped down the back of Mrs. Lomax's radiator with Spark holding on to its lid.",
        "The Hall of Spectacles was long and bright, and every pair in it was watching the door.",
        "There were thousands of pairs, each folded neatly, each with its arms crossed like a waiting passenger.",
        "Looki knew the pair at once, by the little chain and the dent in one arm.",
        "Mrs. Lomax put them on, and cried, and then laughed, and then could not stop doing either.",
        "She read the whole of the newspaper aloud on her step, the weather included.",
        "Mr. Lomax came out to listen, and stayed out long after the paper was finished.",
      ],
      ledger:
        "Spectacles, reading, one pair. Lost by: Mrs. Irene Lomax. Found.",
      tags: [STREET, DOWNTHEBACK, SPECTACLES, LEDGER],
    },
    {
      number: 7,
      title: "Mr. Dustin Pann, Chief Tidier",
      beats: [
        "On a hot Friday a tall grey man in a beautifully pressed suit came down Mallow Street with a clipboard and a broom.",
        "He introduced himself as Mr. Dustin Pann, Chief Tidier of the Downtheback.",
        "He was not unkind; he simply could not bear clutter.",
        "He looked round the shop and straightened the clocks on the wall, one by one, without asking.",
        "Looki hid under the workbench and would not come out until the Tidier had gone.",
        "Mr. Dustin Pann remarked that Finders were very nearly a thing of the past.",
        "On the pier that afternoon, Mr. Wilf Hobday, the deckchair man, was missing his tin whistle.",
        "Looki found it down the back of a deckchair that had been folded away and forgotten.",
        "Mr. Hobday blew it once, very loudly, and every gull on the pier sat down.",
      ],
      ledger:
        "Whistle, tin, one. Lost by: Mr. Wilf Hobday, the deckchair man. Found.",
      tags: [STREET, SHOP, PIER, LEDGER],
    },
    {
      number: 8,
      title: "The Great Sweep",
      beats: [
        "On Sunday morning a notice was pinned to the back of Gran's sofa, in very neat handwriting.",
        "It said that on the last night of the summer, everything nobody was looking for would be swept away.",
        "It would all go into the Nothing-Much, and nothing ever came back from there.",
        "The notice was signed by Mr. Dustin Pann, Chief Tidier, and it was called the Great Sweep.",
        "There are thirty nights left before the Great Sweep.",
        "Looki read the notice twice and then hid in Gran's teapot, with the lid on.",
        "Spark coaxed him out by promising a return before teatime, because work is good for fear.",
        "Mrs. Nancy Merrow had been looking for her own teapot's lid since the spring, and making tea in a saucepan.",
        "The lid was in the Downtheback, sitting on a hill of socks like a small brown hat.",
        "Mrs. Merrow put it on her teapot, and the teapot looked, for the first time in months, like itself.",
      ],
      ledger: "Teapot lid, brown, one. Lost by: Mrs. Nancy Merrow. Found.",
      tags: [STREET, SHOP, DOWNTHEBACK, SOCKS, NOTHING, SWEEP, LEDGER],
    },
    {
      number: 9,
      title: "Six Letters",
      beats: [
        "There are twenty-eight nights left before the Great Sweep.",
        "On a grey Tuesday Looki went looking for a pencil in Spark's drawer, under the rabbit jumper.",
        "He found six letters to Dot, stamped and addressed and never posted.",
        "Dot had moved away at the start of the summer, and Spark had told nobody about the letters.",
        "Looki wrote all six in The Book of Missing, because he could not help it.",
        "Spark was furious with him and said the letters were not lost, only not sent.",
        "Rosie Gallimore, aged nine, came into the shop crying about a yellow hair ribbon.",
        "Spark and Jumpox fetched the ribbon from the Downtheback without Looki, and neither of them enjoyed it.",
        "That night Spark left the drawer open a crack, and Looki took that as an apology.",
      ],
      ledger:
        "Hair ribbon, yellow, one. Lost by: Rosie Gallimore, aged nine. Found.",
      tags: [SHOP, DOWNTHEBACK, LETTERS, SWEEP, LEDGER],
    },
    {
      number: 10,
      title: "The Lighthouse Key",
      beats: [
        "There are twenty-five nights left before the Great Sweep.",
        "On a windy Thursday Mr. Tom Petherick brought his grandfather's barometer into the shop to be mended.",
        "His grandfather had been the last keeper of the Marramby Head lighthouse.",
        "Mr. Petherick had lost the lighthouse key as a boy, and the lighthouse had been shut for thirty years.",
        "Looki said that Mr. Petherick had never quite stopped looking for it, which was lucky.",
        "Jumpox took them down the back of the barometer, which is a very narrow place to jump.",
        "The key was in the Downtheback, as long as Spark's forearm and hanging on a nail as if it expected to be fetched.",
        "Mr. Petherick turned the key over in his hands and did not say anything for a whole minute.",
        "On Saturday the town opened the lighthouse for the first time in thirty years.",
        "Half of Marramby climbed the stairs to look at the sea from the top, and came down talking.",
      ],
      ledger:
        "Key, lighthouse, one, very large. Lost by: Mr. Tom Petherick, the last keeper's grandson. Found.",
      tags: [SHOP, LIGHTHOUSE, DOWNTHEBACK, NOTICING, SWEEP, LEDGER],
    },
    {
      number: 11,
      title: "The Parliament of Socks",
      beats: [
        "There are twenty-three nights left before the Great Sweep.",
        "On a sleepy Monday Mr. Len Morrish asked whether Spark could mend a sock, and she said only if he had both.",
        "He had one grey sock, the right, and had been looking for the left one for a fortnight.",
        "Jumpox jumped them down the back of Mr. Morrish's airing cupboard and into the Hills of Odd Socks.",
        "The odd socks were holding a parliament, and the debate had been going on for a week.",
        "The question before the house was whether socks really wanted to go home.",
        "A striped sock spoke for an hour against, and a woollen one for an hour in favour, and nobody listened to either.",
        "Mr. Morrish's grey sock voted to go home, and was carried out of the chamber on Looki's head.",
        "Mr. Morrish put on both socks at once and wiggled all ten toes.",
      ],
      ledger:
        "Sock, grey, the left of a pair. Lost by: Mr. Len Morrish. Found.",
      tags: [STREET, DOWNTHEBACK, SOCKS, SWEEP, LEDGER],
    },
    {
      number: 12,
      title: "Gran Remembers Something",
      beats: [
        "There are twenty-one nights left before the Great Sweep.",
        "On a wet Wednesday Gran was mending a wireless when Looki came to sit on the end of the workbench.",
        "Gran saw him out of the corner of her eye and went on soldering.",
        "She was not surprised, and she said good morning to him as if he were a customer.",
        "Gran said that she had met a Finder once, when she was ten.",
        "She would not say more, however Spark asked.",
        "Miss Agnes Wrenfield came in that afternoon about a brooch shaped like a silver gull.",
        "Looki found the brooch in the Downtheback, pinned to an umbrella in the forest.",
        "Miss Wrenfield pinned it on, and Gran looked sideways at Looki and smiled.",
      ],
      ledger:
        "Brooch, a silver gull, one. Lost by: Miss Agnes Wrenfield. Found.",
      tags: [SHOP, DOWNTHEBACK, UMBRELLAS, SECRET, SWEEP, LEDGER],
    },
    {
      number: 13,
      title: "A Glint on a Waistcoat",
      beats: [
        "There are nineteen nights left before the Great Sweep.",
        "On a bright Friday Mr. Cyril Dunmore of the town band lost a brass button from his jacket.",
        "He had one rehearsal left before the summer concert, and a jacket that would not close.",
        "Spark and Looki found the button on the bank of the Button River, where the brass ones gleam.",
        "On the way back they met Mr. Dustin Pann, sweeping a path through the socks.",
        "Something small and brass glinted on his waistcoat as he bowed.",
        "Spark was almost sure, and then not sure at all, and then forgot to be sure because he spoke.",
        "Mr. Dunmore sewed the button on himself and played his cornet so loudly at the concert that the pier shook.",
        "That night Spark could not stop thinking about a glint she might have imagined.",
      ],
      ledger:
        "Button, brass, from a bandsman's jacket. Lost by: Mr. Cyril Dunmore. Found.",
      tags: [PIER, DOWNTHEBACK, BUTTONS, SOCKS, MISSING_B, SWEEP, LEDGER],
    },
    {
      number: 14,
      title: "Jumpox Runs Away",
      beats: [
        "There are seventeen nights left before the Great Sweep.",
        "On Sunday Spark laughed at Jumpox for pretending to be a coal scuttle, and Jumpox was offended.",
        "It shut its lid tight, hopped out of the shop and went off down Mallow Street.",
        "By the time Spark reached the pier, there was no sign of it.",
        "Looki said that you cannot find a box by looking for a box.",
        "Spark sat on the pier and thought like a box: somewhere dark, somewhere square, somewhere it would be needed.",
        "She found Jumpox in the fishermen's shed at the end of the pier, pretending to be a bait chest.",
        "Spark said sorry to Jumpox properly, the way you say sorry to a person.",
        "Jumpox opened its lid a crack and then, slowly, all the way.",
        "Looki wrote Jumpox in the ledger, crossed it out, and drew a small tick beside it.",
      ],
      ledger: "Jumpox, one, in a sulk. Lost by: Spark Amari. Found.",
      tags: [SHOP, STREET, PIER, SWEEP, LEDGER],
    },
    {
      number: 15,
      title: "Rain in the Downtheback",
      beats: [
        "There are fifteen nights left before the Great Sweep.",
        "On Tuesday Mr. Ernest Fallow lost the umbrella with the duck's-head handle that his wife had given him.",
        "This time Jumpox took them down the back of the coat stand in Mr. Fallow's hall.",
        "In the Downtheback it began to rain lost umbrellas, falling open as they came.",
        "Spark and Looki sheltered in the Lost Bandstand while umbrellas drummed on the roof.",
        "Looki said, very quietly, that he was scared of the Sweep, and not only for the things.",
        "He was a lost thing himself, and nobody had ever looked for him.",
        "Spark said that she would, and she held his hand without looking at him.",
        "The duck's-head umbrella was hanging from the bandstand rail, and Mr. Fallow opened it indoors.",
      ],
      ledger:
        "Umbrella, black, with a duck's-head handle. Lost by: Mr. Ernest Fallow. Found.",
      tags: [DOWNTHEBACK, UMBRELLAS, BANDSTAND, LETTERS, SWEEP, LEDGER],
    },
    {
      number: 16,
      title: "Everything Brought Back at Once",
      beats: [
        "There are fourteen nights left before the Great Sweep.",
        "On Monday Spark made a list, and the three of them set out to empty the ledger as fast as they could.",
        "That first day they took back a wedding ring.",
        "On Tuesday it was a dog lead, and the dog was more pleased than its owner.",
        "On Wednesday it was a recipe for gingerbread, written in pencil on the back of an envelope.",
        "On Thursday it was a library card, so old that it had a different library on it.",
        "On Friday it was a cassette with a grandmother's laugh on it, and Jenny Quillan played it three times.",
        "By Saturday people in Marramby had begun looking behind their sofas without knowing why.",
        "Mrs. Lomax said that the whole town had gone round the bend, and she sounded pleased.",
        "Looki crossed out so many entries that he had to sharpen his pencil twice.",
        "Seven nights were left by Sunday, and there were still more pages than Spark could count.",
      ],
      ledger:
        "Cassette, one, with a grandmother laughing on it. Lost by: Jenny Quillan. Found.",
      tags: [STREET, PIER, DOWNTHEBACK, NOTICING, SWEEP, LEDGER],
    },
    {
      number: 17,
      title: "The Tidier's Office",
      beats: [
        "There are six nights left before the Great Sweep.",
        "On Monday Mrs. Dora Pellingham lost a red knitted glove, the right hand, in the middle of summer.",
        "Looki traced the glove to Mr. Dustin Pann's office, where the Tidier had put it in a drawer.",
        "Spark went to the office alone, because Looki would not go near it.",
        "The office was perfectly empty and perfectly clean, with one chair, one desk and one clock.",
        "Mr. Dustin Pann gave her the glove at once, offered her a seat, and then did not know what to say.",
        "Nobody had ever visited him before.",
        "He was very lonely, and he did not know it, and Spark did not know how to tell him.",
        "Mrs. Pellingham put on both gloves in August and walked twice round the square to show them off.",
      ],
      ledger:
        "Glove, red, knitted, for a right hand. Lost by: Mrs. Dora Pellingham. Found.",
      tags: [DOWNTHEBACK, OFFICE, SWEEP, LEDGER],
    },
    {
      number: 18,
      title: "What Nobody Looked For",
      beats: [
        "There are four nights left before the Great Sweep.",
        "On Thursday Mr. Stanley Hobbins lost the bronze swimming medal he won in the harbour at fourteen.",
        "Spark found the medal in the Downtheback, in a heap of things nobody had looked for in a long time.",
        "Mr. Dustin Pann was sweeping the heap, slowly, as if he were sorry for each thing.",
        "Spark looked at him sideways, the way she looked at Looki, and suddenly saw him properly.",
        "Mr. Dustin Pann was a lost thing too, and nobody had ever come looking for him.",
        "The brass on his waistcoat was not a button or a badge; it was a B.",
        "Spark told Looki on the way home, and Looki had to sit down on the step.",
        "Gran overheard the name Dustin Pann and dropped a spring into the workbench drawer.",
        "Mr. Hobbins hung his medal on the hook by the door, where he would see it every morning.",
      ],
      ledger:
        "Medal, swimming, bronze, one. Lost by: Mr. Stanley Hobbins. Found.",
      tags: [SHOP, DOWNTHEBACK, MISSING_B, SECRET, SWEEP, LEDGER],
    },
    {
      number: 19,
      title: "Looki Gets Lost",
      beats: [
        "There are two nights left before the Great Sweep.",
        "On the evening before the last day, Ivy Marchbank's red kite came down somewhere behind the pier.",
        "Spark and Jumpox went to fetch it, and Looki said he would wait on the window seat.",
        "When they came back with the kite, the window seat was empty.",
        "Looki was not in the teapot, the coal scuttle, the workbench drawer or the ledger.",
        "Spark looked everywhere, which is no use at all for a creature you cannot look at.",
        "Jumpox gave a low creak and would not stop.",
        "Ivy Marchbank took her kite home under her arm and did not notice Spark's face.",
        "Gran said that the trouble with looking hard is that you only see what you expect.",
        "Spark sat up all night beside the ledger, which had never been so quiet.",
      ],
      ledger:
        "Kite, red, with a long tail. Lost by: Ivy Marchbank, aged eight. Found.",
      tags: [STREET, PIER, SHOP, LETTERS, SWEEP, LEDGER],
    },
    {
      number: 20,
      title: "Sideways",
      beats: [
        "There is a day left before the Great Sweep, and one night.",
        "In the morning Spark stopped looking for Looki and started looking at the whole town at once.",
        "She stood on the pier and let Marramby sit in the corner of her eye.",
        "Something small and dusty moved at the very edge of it, near the bus depot.",
        "Mum was coming off her shift, and Spark ran all the way to meet her.",
        "Looki was asleep in the lost-property box at the bus depot, curled round a single glove.",
        "Mum saw Spark talking to the lost-property box and asked who she was talking to.",
        "Spark told her everything, and Mum, who was very tired, believed every word.",
        "Mum carried the lost-property box home under one arm, very carefully, like a cake.",
        "Looki woke on the window seat and said he was so sorry, he had only gone to look for something.",
      ],
      ledger: "Finder, Third Class, one. Lost by: Spark Amari. Found.",
      tags: [PIER, DEPOT, STREET, SWEEP, LEDGER],
    },
    {
      number: 21,
      title: "The Night Before",
      beats: [
        "There is one night left before the Great Sweep.",
        "Spark worked out that the Sweep could only take things that nobody was looking for.",
        "If everybody looked for one lost thing each, all on the same night, there would be nothing left to sweep.",
        "She called it the Big Look, and she went door to door along Mallow Street to ask.",
        "Mrs. Lomax said yes before Spark had finished asking.",
        "Mr. Petherick said he would light the lighthouse and shine it over the town.",
        "Looki found Mum's very first bus ticket down the back of the lockers at the depot.",
        "By teatime every house in Marramby had a torch ready and something in mind.",
        "Spark took out the six letters and put them on the windowsill where she could see them.",
      ],
      ledger:
        "Bus ticket, the first one, punched. Lost by: Mrs. Amari, Spark's mum. Found.",
      tags: [STREET, SHOP, DEPOT, LETTERS, NOTICING, SWEEP, LEDGER],
    },
    {
      number: 22,
      title: "The Big Look",
      beats: [
        "The Great Sweep is at midnight tonight.",
        "At dusk everyone in Marramby went behind a sofa with a torch.",
        "Mr. Petherick lit the lighthouse, and its beam went round the town like a slow hand.",
        "Spark, Looki and Jumpox jumped down the back of Gran's sofa one last time.",
        "The Downtheback was lit up with things being looked for, glowing like windows at night.",
        "The Hills of Odd Socks shone, the Button River sparkled, and the umbrellas opened all at once.",
        "Mr. Harold Lomax found his rubber torch, the one he took fishing, and used it to look for more.",
        "Mr. Dustin Pann stood at the edge of the light with his broom and did not know where to sweep.",
        "Only one thing in the whole Downtheback stayed dark, and it was the Chief Tidier himself.",
        "Spark ran back up through the sofa to fetch the one person who could look for him.",
      ],
      ledger:
        "Torch, rubber, one, still working. Lost by: Mr. Harold Lomax. Found.",
      tags: [
        STREET,
        LIGHTHOUSE,
        DOWNTHEBACK,
        SOCKS,
        BUTTONS,
        UMBRELLAS,
        NOTICING,
        SWEEP,
        LEDGER,
      ],
    },
    {
      number: 23,
      title: "Found",
      beats: [
        "The Great Sweep is due in one hour.",
        "Spark brought Gran down the back of the sofa, and Gran came without a word, as if she had been waiting.",
        "Gran walked straight across the Hills of Odd Socks to Mr. Dustin Pann.",
        "On the way she told Spark that she had been the keeper's daughter at Marramby Head lighthouse.",
        "When she was ten she had lost the lighthouse dustpan, and she had felt bad about it for sixty years.",
        "A Finder had come looking for the dustpan that summer, and had not been able to find it.",
        'Gran looked at Mr. Dustin Pann, straight at him, and said, "There you are."',
        "Being looked for was what made a lost thing matter, and Mr. Dustin Pann began, very slightly, to shine.",
        "He took the B out of his waistcoat pocket and said he had kept it a hundred years, in case somebody came looking.",
        "Spark fixed the B to the brass plate with two tiny screws, and Jumpox closed itself up with a click.",
        "Jumpox could box again, and the Sweep was called off.",
        "Looki crossed out the oldest entry in the ledger and wrote one more word beside it.",
      ],
      ledger: "B, brass, one. Lost by: Jumpox. Found.",
      tags: [DOWNTHEBACK, SOCKS, MISSING_B, SECRET, SWEEP, LEDGER],
    },
    {
      number: 24,
      title: "Posted",
      beats: [
        "On the first morning after the summer, Spark took the first of the six letters to the postbox.",
        "She posted one a day, because six at once felt like shouting.",
        "Looki walked beside her every morning, at the very edge of her eye.",
        "Looki crossed out the letters in The Book of Missing, one a day, as each one went.",
        "Mr. Dustin Pann came to tea at the shop on Thursday and tidied nothing at all.",
        "Gran gave him the best cup and did not mention the dustpan once.",
        "Mum took a night off and slept all afternoon like a cat in a window.",
        "On the seventh morning a letter came back, addressed in Dot's round handwriting.",
        "Spark held the envelope a long time before she opened it.",
        "Looki, in the corner of her eye, pretended not to be pleased.",
      ],
      ledger: "Letters, to Dot, six. Lost by: Spark Amari. Found.",
      tags: [STREET, SHOP, LETTERS, LEDGER],
    },
  ],
  sentences: [
    {
      text: "Spark wiped her hands on her shorts and picked up the smallest screwdriver.",
      tags: [SPARK, SHOP],
    },
    {
      text: "She liked a job with a beginning, a middle and a click at the end.",
      tags: [SPARK, SHOP],
    },
    {
      text: '"I can fix that," said Spark, before anyone had asked.',
      tags: [SPARK],
    },
    {
      text: "Spark was good at objects and not very good at people, and she knew it.",
      tags: [SPARK],
    },
    {
      text: "The workbench was where Spark did her best thinking, usually with a screw in each fist.",
      tags: [SPARK, SHOP],
    },
    {
      text: "Spark had a way of frowning at a problem until it gave in.",
      tags: [SPARK],
    },
    {
      text: "Spark ran the length of Mallow Street without once looking where her feet were going.",
      tags: [SPARK, STREET],
    },
    {
      text: "She counted the screws twice, because a screw that goes missing goes down the back of something.",
      tags: [SPARK],
    },
    { text: '"Hold still," Spark told the hinge, and it did.', tags: [SPARK] },
    {
      text: "Spark did not like speeches, so she said the short thing instead.",
      tags: [SPARK],
    },
    {
      text: "It is hard to stay cross with someone while you are mending something of theirs.",
      tags: [SPARK, NARRATOR],
    },
    {
      text: "Spark oiled the hinge until it stopped complaining.",
      tags: [SPARK, SHOP],
    },
    {
      text: "She put her hands in her pockets so that nobody could see them shaking.",
      tags: [SPARK],
    },
    {
      text: "Spark knew exactly how a kettle worked and had no idea at all how to say sorry.",
      tags: [SPARK],
    },
    {
      text: '"That\'s a loose wire," said Spark. "That\'s all that is."',
      tags: [SPARK],
    },
    { text: "Spark tried to look as if she had planned it.", tags: [SPARK] },
    {
      text: "Spark took the long way home, past the chip shop, so she would have time to think.",
      tags: [SPARK, STREET],
    },
    {
      text: "She chewed the end of her plait, which she did when a sum would not come out.",
      tags: [SPARK],
    },
    {
      text: '"Right," said Spark, which was what she said instead of being frightened.',
      tags: [SPARK],
    },
    {
      text: "Spark had a rule about broken things: never say never until you've had the back off.",
      tags: [SPARK],
    },
    {
      text: "Spark had mended a great many things, but she had never mended a promise.",
      tags: [SPARK],
    },
    {
      text: "She tipped the drawer out on the workbench and sorted it into springs, screws and maybes.",
      tags: [SPARK, SHOP],
    },
    {
      text: "Spark's knees were always grazed, and she was proud of every one.",
      tags: [SPARK],
    },
    {
      text: "Spark was not sure about people, but she was always sure about a hinge.",
      tags: [SPARK],
    },
    {
      text: '"Leave it with me," said Spark, the way Gran did.',
      tags: [SPARK],
    },
    {
      text: "She held her breath, as if breathing might frighten the screw.",
      tags: [SPARK],
    },
    {
      text: "Spark decided, and once Spark had decided there was no point arguing.",
      tags: [SPARK],
    },
    {
      text: "Spark pulled her socks up, both of them, which always helped.",
      tags: [SPARK],
    },
    {
      text: "Spark waved at the milkman, who waved back with a bottle.",
      tags: [SPARK, STREET],
    },
    {
      text: "Ten is old enough to know something is wrong, and too young to be told what.",
      tags: [SPARK],
    },
    {
      text: '"It isn\'t broken," Spark said slowly. "It\'s just waiting."',
      tags: [SPARK],
    },
    {
      text: "Spark rubbed her nose and left a streak of oil across it.",
      tags: [SPARK],
    },
    {
      text: '"I\'ll have it working by teatime," said Spark, and she very nearly did.',
      tags: [SPARK],
    },
    {
      text: "Spark lay on her back on the rug and looked at the ceiling until an idea fell off it.",
      tags: [SPARK],
    },
    {
      text: "She liked the smell of solder, which is a smell like hot pennies.",
      tags: [SPARK, SHOP],
    },
    {
      text: "Spark gave the screw one more quarter-turn, for luck.",
      tags: [SPARK],
    },
    {
      text: "Spark said nothing, which for Spark was a great deal.",
      tags: [SPARK],
    },
    {
      text: '"Can I look inside?" Spark asked, because that was always the first question.',
      tags: [SPARK],
    },
    {
      text: "Spark wrote it down on the back of her hand so that she could not lose it.",
      tags: [SPARK],
    },
    { text: "She did not cry, because her hands were full.", tags: [SPARK] },
    {
      text: "Spark had never once in her life been able to leave a wobbly table alone.",
      tags: [SPARK],
    },
    {
      text: "Spark sat on the window seat with her chin on her knees and watched the street go by.",
      tags: [SPARK, SHOP],
    },
    {
      text: "She was a little bit frightened, and a little bit thrilled, and mostly hungry.",
      tags: [SPARK],
    },
    {
      text: "Spark nodded as if she understood, and then went away to understand it properly.",
      tags: [SPARK],
    },
    {
      text: '"Everything\'s got a way in," said Spark. "You just have to find the screw."',
      tags: [SPARK],
    },
    {
      text: "She tried looking straight at nothing, which is harder than it sounds.",
      tags: [SPARK],
    },
    {
      text: "Spark was the sort of person who read the instructions afterwards.",
      tags: [SPARK],
    },
    {
      text: "Spark felt her ears go hot, which they did whenever she had been unfair.",
      tags: [SPARK],
    },
    {
      text: "Spark tucked the pencil behind her ear, where it promptly fell out.",
      tags: [SPARK],
    },
    {
      text: "She took a deep breath and said the true thing, which was the hard thing.",
      tags: [SPARK],
    },
    {
      text: "Spark rolled up her sleeves, which was how her hands knew it was time.",
      tags: [SPARK],
    },
    {
      text: '"Don\'t worry," said Spark, and then she worried for both of them.',
      tags: [SPARK],
    },
    {
      text: "Spark hopped over the cracks in the pavement, but only the long ones.",
      tags: [SPARK, STREET],
    },
    {
      text: "Spark could tell a clock was unhappy by the way it ticked.",
      tags: [SPARK, SHOP],
    },
    {
      text: "She knew the inside of a radio better than she knew her own times tables.",
      tags: [SPARK],
    },
    { text: '"I\'m not cross," said Spark, very crossly.', tags: [SPARK] },
    {
      text: "Spark thought that a thing worth keeping was a thing worth mending.",
      tags: [SPARK],
    },
    {
      text: "Spark put the kettle on, because that is what you do.",
      tags: [SPARK, SHOP],
    },
    {
      text: "She had a feeling, the kind of feeling you get just before a fuse goes.",
      tags: [SPARK],
    },
    {
      text: "Spark's stomach did a small somersault and landed badly.",
      tags: [SPARK],
    },
    {
      text: "Looki sat in the corner of Spark's eye, as neat as a full stop.",
      tags: [LOOKI],
    },
    {
      text: '"Strictly speaking," said Looki, "I am not here at all."',
      tags: [LOOKI],
    },
    {
      text: "\"I'm afraid that's rather the problem, strictly speaking,\" said Looki.",
      tags: [LOOKI],
    },
    {
      text: "Looki apologised to the chair before he sat on it.",
      tags: [LOOKI],
    },
    {
      text: '"Your cooker — your oven," said Looki, correcting himself.',
      tags: [LOOKI, SHOP],
    },
    {
      text: '"I do beg your pardon," Looki said to the door he had bumped.',
      tags: [LOOKI],
    },
    {
      text: "Looki's ears, which were shaped like teaspoons, turned towards the sound.",
      tags: [LOOKI],
    },
    {
      text: "His eyes were the colour of two lamps left on in a window.",
      tags: [LOOKI],
    },
    {
      text: "If you turned your head too fast, Looki was simply not there.",
      tags: [LOOKI],
    },
    {
      text: '"Third Class is the best class to be," said Looki, "because there is so much still to learn."',
      tags: [LOOKI],
    },
    {
      text: "Looki cleared his throat, which was the sound a mouse makes in a library.",
      tags: [LOOKI],
    },
    {
      text: '"Would you mind awfully looking at the kettle?" Looki asked.',
      tags: [LOOKI],
    },
    {
      text: "Looki was about the size of a cat and about as heavy as a tea cosy.",
      tags: [LOOKI],
    },
    {
      text: '"That is a most handsome spoon," Looki told the spoon.',
      tags: [LOOKI],
    },
    {
      text: "Looki had very small hands and kept them folded, as if he were waiting to be called.",
      tags: [LOOKI],
    },
    {
      text: '"I shall make a note of it," said Looki, and he did.',
      tags: [LOOKI],
    },
    {
      text: '"Your lamp-post — your street light," said Looki.',
      tags: [LOOKI, STREET],
    },
    { text: "Looki was easy to lose, even for himself.", tags: [LOOKI] },
    { text: '"One does one\'s best," said Looki modestly.', tags: [LOOKI] },
    {
      text: "Looki sniffed the air like a person reading a timetable.",
      tags: [LOOKI],
    },
    {
      text: '"It isn\'t polite to stare," said Looki, "and in my case it isn\'t safe either."',
      tags: [LOOKI],
    },
    {
      text: "Looki was the colour of dust in a sunbeam, so sunny days hid him best.",
      tags: [LOOKI],
    },
    {
      text: '"I\'m terribly sorry," said Looki to the cushion he had sat on.',
      tags: [LOOKI],
    },
    {
      text: '"Your bicycle — your two-wheeled cart," said Looki, and then, "no, bicycle, I had it right."',
      tags: [LOOKI],
    },
    {
      text: "Looki was very fond of tea, though he took it sideways.",
      tags: [LOOKI],
    },
    {
      text: "When he was pleased, Looki's ears went up like a hare's.",
      tags: [LOOKI],
    },
    {
      text: "When he was worried, Looki's ears folded flat like a closed book.",
      tags: [LOOKI],
    },
    {
      text: '"That is not a thing we say in the Downtheback," said Looki, shocked.',
      tags: [LOOKI, DOWNTHEBACK],
    },
    {
      text: "Looki said thank you to the step for being there.",
      tags: [LOOKI],
    },
    {
      text: '"May I?" Looki asked, and only when the drawer had not objected did he open it.',
      tags: [LOOKI],
    },
    {
      text: '"Rather," said Looki, which meant yes, very much.',
      tags: [LOOKI],
    },
    {
      text: "Looki hummed when he was concentrating, a tune that went nowhere in particular.",
      tags: [LOOKI],
    },
    {
      text: '"There is no such thing as a small lost thing," said Looki.',
      tags: [LOOKI],
    },
    {
      text: "Looki had a pencil behind his ear and a worry behind that.",
      tags: [LOOKI],
    },
    {
      text: '"Your wireless — your radio," said Looki, "is talking to itself."',
      tags: [LOOKI, SHOP],
    },
    {
      text: "Looki climbed onto the windowsill and sat with his back to the room, which was considerate.",
      tags: [LOOKI, SHOP],
    },
    {
      text: '"I wonder if I might trouble you for a biscuit," said Looki.',
      tags: [LOOKI],
    },
    {
      text: '"Oh dear," said Looki, "oh dear, oh dear, oh dear."',
      tags: [LOOKI],
    },
    {
      text: "Looki's voice went very small, the way a voice goes when it does not want to be overheard.",
      tags: [LOOKI],
    },
    {
      text: '"Finders do not run," said Looki. "We proceed briskly."',
      tags: [LOOKI],
    },
    {
      text: '"How splendid," said Looki, and he rubbed his little hands together.',
      tags: [LOOKI],
    },
    {
      text: "Looki bowed to the clock, and the clock, being a clock, ticked back.",
      tags: [LOOKI, SHOP],
    },
    {
      text: '"I should like that very much," said Looki, "if it isn\'t any trouble."',
      tags: [LOOKI],
    },
    {
      text: '"A Finder never says never," said Looki. "A Finder says not yet."',
      tags: [LOOKI],
    },
    { text: "Looki was as quiet as a moth on a curtain.", tags: [LOOKI] },
    {
      text: '"I beg your pardon, I was miles away," said Looki, who had been under the table.',
      tags: [LOOKI],
    },
    {
      text: "Looki patted Jumpox's lid, and Jumpox leaned into it like a cat.",
      tags: [LOOKI, JUMPOX],
    },
    {
      text: '"Your cupboard — your wardrobe — your cupboard," said Looki, and gave up.',
      tags: [LOOKI],
    },
    {
      text: '"In my experience," said Looki, "things are always in the last place you look, because then you stop."',
      tags: [LOOKI],
    },
    { text: "Looki trembled all over, like a jelly on a bus.", tags: [LOOKI] },
    {
      text: "Looki ate a crumb of cheese with tremendous dignity.",
      tags: [LOOKI],
    },
    {
      text: '"We Finders are a dwindling sort," said Looki, "like lamplighters."',
      tags: [LOOKI],
    },
    {
      text: '"How very kind," said Looki, "how very, very kind."',
      tags: [LOOKI],
    },
    {
      text: "Looki apologised to the umbrella for getting it wet, which it already was.",
      tags: [LOOKI],
    },
    {
      text: "Looki stood on tiptoe, which made him slightly taller and much more anxious.",
      tags: [LOOKI],
    },
    {
      text: '"I am perfectly all right," said Looki, which was what he said when he was not.',
      tags: [LOOKI],
    },
    { text: '"Oh, my goodness," said Looki faintly.', tags: [LOOKI] },
    {
      text: '"Most things want to go home, you\'ll find, if you ask them nicely," said Looki.',
      tags: [LOOKI],
    },
    {
      text: "Looki was polite to everything, including things that could not hear him and things that would not have cared.",
      tags: [LOOKI],
    },
    {
      text: '"Your kettle — your boiler," said Looki. "No. Kettle."',
      tags: [LOOKI, SHOP],
    },
    {
      text: "Looki walked the way a teacup would walk if it had legs and was being careful.",
      tags: [LOOKI],
    },
    {
      text: '"I must say," Looki said, "this is a very well-kept drawer."',
      tags: [LOOKI, SHOP],
    },
    {
      text: '"We are not allowed to keep anything," said Looki, "not even a button."',
      tags: [LOOKI],
    },
    {
      text: "Looki's yellow eyes blinked slowly, one and then the other, like a lighthouse with a cold.",
      tags: [LOOKI],
    },
    {
      text: '"After you," said Looki to a fly, and held the door.',
      tags: [LOOKI],
    },
    {
      text: "Looki could fit into a teacup, a coat pocket or a gap you would not have thought had a gap in it.",
      tags: [LOOKI],
    },
    {
      text: '"One mustn\'t grumble," said Looki, and then grumbled very quietly to himself.',
      tags: [LOOKI],
    },
    {
      text: '"Thank you ever so," said Looki, and he made a small bow at the floor.',
      tags: [LOOKI],
    },
    {
      text: '"I am afraid I have no idea what a sandwich toaster is for," said Looki.',
      tags: [LOOKI, SHOP],
    },
    {
      text: '"Your doorbell — your door knocker," said Looki. "Your ding-dong."',
      tags: [LOOKI, STREET],
    },
    {
      text: "Looki liked to be useful, the way some people like to be warm.",
      tags: [LOOKI],
    },
    {
      text: "Looki tucked his feet under him and became almost perfectly round.",
      tags: [LOOKI],
    },
    { text: '"There," said Looki softly. "There, now."', tags: [LOOKI] },
    {
      text: "\"I'm not at all sure that's allowed,\" said Looki, who was already doing it.",
      tags: [LOOKI],
    },
    {
      text: "Looki sat so still that a moth landed on him and stayed.",
      tags: [LOOKI],
    },
    {
      text: '"Shall we?" said Looki, and offered his small hand to nobody in particular.',
      tags: [LOOKI],
    },
    {
      text: '"It is the first rule and the last rule," said Looki. "Found, not replaced."',
      tags: [LOOKI],
    },
    {
      text: '"Oh, gosh," said Looki, which was the most surprised word he knew.',
      tags: [LOOKI],
    },
    {
      text: "Looki apologised to the stairs for every single step.",
      tags: [LOOKI, SHOP],
    },
    {
      text: '"That is the sort of thing one hopes for and never expects," said Looki.',
      tags: [LOOKI],
    },
    { text: "Jumpox gave a small tock, which meant yes.", tags: [JUMPOX] },
    {
      text: "Jumpox's lid went tock-tock-tock, the way a dog's tail goes when you come home.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox shut its lid tight and would not open it for anybody.",
      tags: [JUMPOX],
    },
    {
      text: "A low creak came from Jumpox, the creak of a worried floorboard.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox hopped twice to the left and once to the right, which was dancing.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox sat by the door with its feet together, like a dog that knows the word walk.",
      tags: [JUMPOX],
    },
    { text: "Jumpox sulked with tremendous energy.", tags: [JUMPOX] },
    {
      text: "When Jumpox was pleased, its brass corners seemed to shine a little brighter.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox nudged Spark's ankle with its corner.",
      tags: [JUMPOX, SPARK],
    },
    {
      text: "Jumpox hopped up onto the window seat and settled there like a cat in the sun.",
      tags: [JUMPOX, SHOP],
    },
    {
      text: "Jumpox's four brass feet drummed on the floorboards.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox did not like the vacuum cleaner and hid behind the curtain until it had gone.",
      tags: [JUMPOX, SHOP],
    },
    {
      text: "Jumpox gave a very small tock, the kind that means yes, but only just.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox shuffled round to face the other way, which is what boxes do instead of folding their arms.",
      tags: [JUMPOX],
    },
    {
      text: "A tock came from under the table, and then another, closer.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox hopped along behind Spark like a duckling made of furniture.",
      tags: [JUMPOX, SPARK],
    },
    {
      text: "Jumpox opened its lid a crack, the way you open one eye on a Saturday.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox's lid creaked open and banged shut, which was a sneeze.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox leaned against Spark's leg and creaked contentedly.",
      tags: [JUMPOX, SPARK],
    },
    {
      text: "Jumpox gathered its four feet underneath it, which was how it got ready to jump.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox gave a long, slow creak, like a ship's timbers in a wind.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox clattered across the floor in delight and bumped into the coal bucket.",
      tags: [JUMPOX, SHOP],
    },
    {
      text: "Jumpox's lid lifted a crack to see who was there, and shut again when it saw.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox did not have a face, but it had a way of looking hurt.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox would not hop, would not tock and would not open, and that was that.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox trembled on its feet like a kettle just before it boils.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox nosed open the door with its lid, which it was not supposed to do.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox stood very still beside the stove and was a coal scuttle as hard as it could.",
      tags: [JUMPOX, SHOP],
    },
    {
      text: "The box gave one hop forward and one hop back, which was as good as a shrug.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox was the only box Spark had ever met that could look smug.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox clapped its lid twice in the dark, to say it was still there.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox's lid rattled, which meant it was laughing.",
      tags: [JUMPOX],
    },
    {
      text: "The old velvet inside Jumpox smelled of pianos and long journeys.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox's brass feet were cold in the mornings and warm by the afternoon.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox went tock, very firmly, the way you put down a cup when you have made up your mind.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox hopped onto Spark's lap, which was much too small for it, and stayed.",
      tags: [JUMPOX, SPARK],
    },
    {
      text: "A small hop, a smaller hop, and Jumpox was hiding behind Spark's legs.",
      tags: [JUMPOX, SPARK],
    },
    {
      text: "Jumpox's lid fell open with a soft thump, which was a yawn.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox gave a low, long creak that went on even after Spark had patted it.",
      tags: [JUMPOX],
    },
    { text: "Jumpox did not bark, but it came very close.", tags: [JUMPOX] },
    {
      text: "Jumpox flapped its lid so hard that the velvet inside fluttered.",
      tags: [JUMPOX],
    },
    {
      text: "Somewhere under the stairs, a lid went tock, and Spark knew she had been forgiven.",
      tags: [JUMPOX, SPARK],
    },
    {
      text: "Jumpox took a little run up, which for a box is three hops, and jumped.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox was patient the way a post box is patient.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox's corners had gone green with age, like the railings on the pier.",
      tags: [JUMPOX],
    },
    {
      text: "On the brass plate, the gap where the B had been looked like a missing tooth.",
      tags: [JUMPOX, MISSING_B],
    },
    {
      text: "Jumpox did not care for gulls and gave a loud tock whenever one landed on the sill.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox hopped round the kitchen table three times and then lay down, exhausted.",
      tags: [JUMPOX],
    },
    {
      text: "Jumpox was sulking under the stairs, and the whole house could feel it.",
      tags: [JUMPOX, SHOP],
    },
    {
      text: "When it rained, Jumpox's lid swelled and stuck, and it was very grumpy until teatime.",
      tags: [JUMPOX],
    },
    {
      text: '"Most things want mending more than they want replacing," said Gran.',
      tags: [GRAN],
    },
    {
      text: '"A spring wants patience and a screw wants a reason," said Gran.',
      tags: [GRAN],
    },
    {
      text: '"There\'s no such thing as a thing that can\'t be mended," said Gran, "only a thing nobody\'s tried."',
      tags: [GRAN],
    },
    {
      text: 'Gran said "Spark" the way other grandmothers said "darling", and it meant the same.',
      tags: [GRAN],
    },
    {
      text: "Gran kept a tin of peppermints by the till and ate them herself, one an hour.",
      tags: [GRAN, SHOP],
    },
    { text: '"Look twice, mend once," said Gran.', tags: [GRAN] },
    {
      text: '"Clocks know when you\'re in a hurry," said Gran, "and they slow down to teach you."',
      tags: [GRAN],
    },
    {
      text: "Gran's glasses lived on the end of her nose and never went any higher.",
      tags: [GRAN],
    },
    {
      text: '"Oil it, don\'t force it," said Gran, which she said about hinges and about people.',
      tags: [GRAN],
    },
    {
      text: 'Gran had a way of saying "mm" that meant she knew more than she was telling.',
      tags: [GRAN],
    },
    {
      text: "Gran's hands smelled of oil and peppermint and were never still.",
      tags: [GRAN, SHOP],
    },
    {
      text: '"A thing that\'s loved gets lost," said Gran. "A thing nobody loves just gets left."',
      tags: [GRAN],
    },
    {
      text: "Gran did not hold with waste, and she did not hold with fuss either.",
      tags: [GRAN],
    },
    {
      text: "Gran looked at the coal scuttle out of the corner of her eye and said nothing at all.",
      tags: [GRAN, SECRET],
    },
    {
      text: '"There\'s a right way round for everything," said Gran, "even a fuse."',
      tags: [GRAN],
    },
    {
      text: "Gran mended a wireless while she ate her toast and got crumbs in neither.",
      tags: [GRAN, SHOP],
    },
    { text: '"Never trust a shiny screw," said Gran.', tags: [GRAN] },
    {
      text: '"Tide comes in, tide goes out," said Gran, "and the bins still want taking out."',
      tags: [GRAN],
    },
    {
      text: "Gran had a little brass bell on the shop door that she said was older than the pier.",
      tags: [GRAN, SHOP],
    },
    {
      text: '"When in doubt, have a cup of tea and look again," said Gran.',
      tags: [GRAN],
    },
    {
      text: "Gran never looked straight at the window seat, which Spark noticed and then forgot she had noticed.",
      tags: [GRAN, SECRET],
    },
    {
      text: "\"Ask a kettle nicely and it'll tell you what's wrong,\" said Gran.",
      tags: [GRAN],
    },
    {
      text: "Gran sniffed, which in Gran's language was a whole paragraph.",
      tags: [GRAN],
    },
    {
      text: '"A bit of rust is just a thing saying it\'s been waiting," said Gran.',
      tags: [GRAN],
    },
    {
      text: "Gran wound the shop clocks every Sunday, one by one, talking to each of them.",
      tags: [GRAN, SHOP],
    },
    {
      text: "Gran's apron had eleven pockets and each one had a different job.",
      tags: [GRAN, SHOP],
    },
    {
      text: '"Don\'t you dare throw that out," said Gran, before Spark had even picked it up.',
      tags: [GRAN],
    },
    {
      text: '"Every broken thing was a whole thing once," said Gran, "and it remembers."',
      tags: [GRAN],
    },
    { text: "Gran laughed like a drawer full of spoons.", tags: [GRAN] },
    { text: '"Sit down before you fall down," said Gran.', tags: [GRAN] },
    { text: '"A watched glue never sets," said Gran.', tags: [GRAN] },
    {
      text: "Gran held the clock to her ear the way a doctor listens to a chest.",
      tags: [GRAN, SHOP],
    },
    {
      text: '"Forty years I\'ve done this," said Gran, "and I\'m still learning which way round a washer goes."',
      tags: [GRAN],
    },
    {
      text: "Gran's eyebrows went up, which was as good as a question.",
      tags: [GRAN],
    },
    {
      text: '"The tide doesn\'t hurry and it always gets there," said Gran.',
      tags: [GRAN],
    },
    {
      text: "Gran put a hand on Spark's head, briefly, the way you test whether a kettle is warm.",
      tags: [GRAN, SPARK],
    },
    {
      text: "Gran hummed a tune Spark did not know, an old one, with a lighthouse in it somewhere.",
      tags: [GRAN, SECRET],
    },
    {
      text: '"Being sorry\'s a start," said Gran. "Mending it\'s the rest."',
      tags: [GRAN],
    },
    {
      text: '"Mind your fingers," said Gran, as she had said every day for ten years.',
      tags: [GRAN],
    },
    {
      text: "Gran had a saying for every kind of weather and two for rain.",
      tags: [GRAN],
    },
    {
      text: "Gran turned the sign on the door to CLOSED and put the kettle on.",
      tags: [GRAN, SHOP],
    },
    {
      text: '"Nobody\'s a villain if you know them long enough," said Gran.',
      tags: [GRAN],
    },
    {
      text: "Gran listened to the whole story without once saying I told you so.",
      tags: [GRAN],
    },
    {
      text: '"Things go where they\'re needed," said Gran, "and sometimes that\'s down the back of the sofa."',
      tags: [GRAN],
    },
    {
      text: "Gran said goodnight to the clocks before she said goodnight to Spark, and Spark did not mind.",
      tags: [GRAN, SHOP],
    },
    {
      text: '"I knew someone once who looked at things sideways," said Gran, and then talked about the weather.',
      tags: [GRAN, SECRET],
    },
    { text: '"Slow is quick, in the end," said Gran.', tags: [GRAN] },
    {
      text: "Gran folded her arms, which meant the matter was closed.",
      tags: [GRAN],
    },
    {
      text: "Gran's voice was like a well-oiled drawer: it never stuck.",
      tags: [GRAN],
    },
    {
      text: '"Put it on the bench and tell me where it hurts," said Gran to the radio.',
      tags: [GRAN, SHOP],
    },
    {
      text: '"A thing you keep looking for is never quite lost," said Gran.',
      tags: [GRAN],
    },
    {
      text: "Gran had small round glasses and a large round laugh.",
      tags: [GRAN],
    },
    {
      text: "Gran soldered with her tongue between her teeth, exactly like Spark.",
      tags: [GRAN, SHOP],
    },
    {
      text: '"There," said Gran, and the clock started ticking, as if it had been waiting for her permission.',
      tags: [GRAN, SHOP],
    },
    {
      text: "\"Where there's a hinge there's a way,\" said Gran.",
      tags: [GRAN],
    },
    {
      text: "Mum drove the night bus and came home when the gulls were waking up.",
      tags: [MUM, DEPOT],
    },
    {
      text: '"Morning, Sparks," said Mum, at four in the afternoon.',
      tags: [MUM],
    },
    {
      text: "Mum was asleep, so the whole flat walked on tiptoe.",
      tags: [MUM, SHOP],
    },
    {
      text: "Mum made toast the way she drove the bus: carefully, and with a lot of stopping.",
      tags: [MUM],
    },
    {
      text: '"Sparks, what\'ve you broken now?" Mum asked, which was a joke between them.',
      tags: [MUM],
    },
    {
      text: "Mum's uniform hung on the back of the door like a tired person.",
      tags: [MUM],
    },
    {
      text: "Mum yawned so wide that Spark could see what she had had for breakfast.",
      tags: [MUM],
    },
    { text: '"I\'m not asleep," said Mum, who was.', tags: [MUM] },
    {
      text: "Mum had the bus timetable in her head and could say it backwards.",
      tags: [MUM],
    },
    {
      text: "Mum kissed the top of Spark's head and smelled of diesel and toast.",
      tags: [MUM],
    },
    {
      text: '"Only wake me if the house catches fire," said Mum, "or if there\'s cake."',
      tags: [MUM],
    },
    {
      text: "Mum's phone had cracked glass and was mostly charging on the kitchen shelf.",
      tags: [MUM, SHOP],
    },
    {
      text: "Mum sang in the bath, badly, which was how Spark knew she was happy.",
      tags: [MUM],
    },
    {
      text: '"How was your day, Sparks?" asked Mum, and fell asleep before the answer.',
      tags: [MUM],
    },
    {
      text: "Mum knew every bus on the night runs by the sound of its engine.",
      tags: [MUM, DEPOT],
    },
    {
      text: "Mum ate her breakfast at teatime and her tea at midnight.",
      tags: [MUM],
    },
    {
      text: '"Don\'t tell me," said Mum. "You\'ve taken the toaster apart again."',
      tags: [MUM],
    },
    {
      text: "Mum came in on her tiptoes and left her shoes by the door like two sleeping dogs.",
      tags: [MUM],
    },
    {
      text: "Mum's laugh was the best thing in the flat, and it was rarely awake.",
      tags: [MUM],
    },
    {
      text: "Mum said that the bus depot at dawn was the quietest place in Marramby.",
      tags: [MUM, DEPOT],
    },
    { text: '"Sparks," said Mum sleepily, "is that box new?"', tags: [MUM] },
    {
      text: "Mum drank her tea in one go and went straight back to bed.",
      tags: [MUM],
    },
    {
      text: "Mum left notes on the kettle, and every one of them said to eat something green.",
      tags: [MUM, SHOP],
    },
    {
      text: "Mum was very good at being tired and funny at the same time.",
      tags: [MUM],
    },
    {
      text: '"Is that you, Sparks, or a burglar?" called Mum from the bedroom.',
      tags: [MUM],
    },
    {
      text: '"Everything in its place," said Mr. Dustin Pann, "and most things in no place at all."',
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann's suit was so beautifully pressed it might have been ironed with him inside.",
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann never shouted; he did not see the need.",
      tags: [DUSTIN],
    },
    {
      text: "He held his broom the way a bandleader holds a baton.",
      tags: [DUSTIN],
    },
    {
      text: '"A tidy floor is a happy floor," said Mr. Dustin Pann.',
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann straightened a picture on the wall without seeming to notice he had done it.",
      tags: [DUSTIN],
    },
    {
      text: '"I am not unkind," said Mr. Dustin Pann. "I am merely thorough."',
      tags: [DUSTIN],
    },
    {
      text: "He wrote on his clipboard in handwriting so neat it looked printed.",
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann was tall and grey, the grey of a well-swept step.",
      tags: [DUSTIN],
    },
    {
      text: '"It is nothing personal," said Mr. Dustin Pann. "It is simply the schedule."',
      tags: [DUSTIN, SWEEP],
    },
    {
      text: "Mr. Dustin Pann bowed very slightly, as if bowing more would crease him.",
      tags: [DUSTIN],
    },
    { text: '"Clutter," said Mr. Dustin Pann, and shuddered.', tags: [DUSTIN] },
    {
      text: "He was sorry for the Sweep in the way a clock is sorry for the time.",
      tags: [DUSTIN, SWEEP],
    },
    {
      text: "Mr. Dustin Pann took off his hat and held it against his chest like a promise.",
      tags: [DUSTIN],
    },
    {
      text: '"Mess," said Mr. Dustin Pann, "is only order that has not been introduced."',
      tags: [DUSTIN],
    },
    {
      text: "He did not sit down; he arranged himself on the chair.",
      tags: [DUSTIN],
    },
    {
      text: '"Nobody is looking for any of it," said Mr. Dustin Pann gently. "I have checked."',
      tags: [DUSTIN, SWEEP],
    },
    {
      text: "Mr. Dustin Pann's shoes were polished until the sky showed in them.",
      tags: [DUSTIN],
    },
    {
      text: '"Good afternoon," said Mr. Dustin Pann, and he said it as if he were filing it.',
      tags: [DUSTIN],
    },
    {
      text: "His voice was dry and level, like a ruler laid on a desk.",
      tags: [DUSTIN],
    },
    {
      text: '"A place for everything," said Mr. Dustin Pann, "and the Nothing-Much for the rest."',
      tags: [DUSTIN, NOTHING, SWEEP],
    },
    {
      text: "Mr. Dustin Pann tapped his clipboard twice, which was his way of saying a thing was settled.",
      tags: [DUSTIN],
    },
    {
      text: '"I should never dream of making a mess," said Mr. Dustin Pann, as if mess were rude.',
      tags: [DUSTIN],
    },
    {
      text: "He swept the way other people breathe: all the time and without thinking.",
      tags: [DUSTIN],
    },
    {
      text: "There was nothing on Mr. Dustin Pann's desk, and he dusted it anyway.",
      tags: [DUSTIN, OFFICE],
    },
    {
      text: "Mr. Dustin Pann looked round the shop the way a dentist looks round a mouth.",
      tags: [DUSTIN, SHOP],
    },
    {
      text: '"Do forgive me," said Mr. Dustin Pann, and straightened Spark\'s collar.',
      tags: [DUSTIN, SPARK],
    },
    {
      text: "Nobody had ever asked Mr. Dustin Pann how he was, and so he had never had to decide.",
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann had a small, careful smile that he used about once a year.",
      tags: [DUSTIN],
    },
    {
      text: '"I do not dislike things," said Mr. Dustin Pann. "I simply prefer them elsewhere."',
      tags: [DUSTIN],
    },
    {
      text: "His office clock ticked very quietly, as if it did not want to disturb him.",
      tags: [DUSTIN, OFFICE],
    },
    {
      text: '"Most kind," said Mr. Dustin Pann, who did not know what to do with kindness.',
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann turned his hat round by the brim, the only untidy thing he ever did.",
      tags: [DUSTIN],
    },
    {
      text: '"The Sweep is not a punishment," said Mr. Dustin Pann. "It is housekeeping."',
      tags: [DUSTIN, SWEEP],
    },
    {
      text: "He smelled faintly of polish and of rooms where nobody goes.",
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann looked at a crumb on the counter until Spark brushed it away.",
      tags: [DUSTIN, SHOP],
    },
    {
      text: '"I have never been lost in my life," said Mr. Dustin Pann, a little too quickly.',
      tags: [DUSTIN],
    },
    {
      text: "Mr. Dustin Pann made a note on his clipboard and underlined it with a ruler.",
      tags: [DUSTIN],
    },
    {
      text: '"I shall be very sorry to do it," said Mr. Dustin Pann, "and I shall do it very well."',
      tags: [DUSTIN, SWEEP],
    },
    {
      text: "Mr. Dustin Pann's waistcoat had four buttons, and all four were done up.",
      tags: [DUSTIN],
    },
    {
      text: "If you have ever tried to hold a river of buttons in your hands, you will know.",
      tags: [NARRATOR, BUTTONS],
    },
    {
      text: "You may not believe this part, but it is true, and I was very nearly there.",
      tags: [NARRATOR],
    },
    {
      text: "You have probably lost something down the back of a sofa yourself, so you know what I mean.",
      tags: [NARRATOR],
    },
    {
      text: "I should say, in case you are worried, that this part ends well.",
      tags: [NARRATOR],
    },
    {
      text: "You can try it yourself tonight: look at the lamp, and see what sits beside it.",
      tags: [NARRATOR],
    },
    {
      text: "This is the sort of thing that only happens on a Tuesday, as you may have noticed.",
      tags: [NARRATOR],
    },
    {
      text: "If you are reading this out loud, this is a good place to do a creak.",
      tags: [NARRATOR, JUMPOX],
    },
    {
      text: "You will want to know what happened next, and so did Spark.",
      tags: [NARRATOR, SPARK],
    },
    {
      text: "Never trust a sock that has been on its own for a long time; they get ideas.",
      tags: [NARRATOR, SOCKS],
    },
    {
      text: "You might think a box cannot sulk, but you have not met Jumpox.",
      tags: [NARRATOR, JUMPOX],
    },
    {
      text: "If you have a gran, you will know the look; if you have not, imagine a kettle deciding something.",
      tags: [NARRATOR, GRAN],
    },
    {
      text: "I won't tell you what was in the drawer yet, because Spark wasn't telling anyone either.",
      tags: [NARRATOR, LETTERS],
    },
    {
      text: "You may laugh, but you would have hidden in a teapot too.",
      tags: [NARRATOR, SWEEP],
    },
    {
      text: "Look behind your own sofa one day, but ask first, and take a torch.",
      tags: [NARRATOR],
    },
    {
      text: "It is very hard to describe something you can only see sideways, so I shall do my best.",
      tags: [NARRATOR, LOOKI],
    },
    {
      text: "You and I know what Spark should have said, but things are easy to know in a book.",
      tags: [NARRATOR, SPARK],
    },
    {
      text: "If you are ever lost, by the way, stay where you are and somebody will come.",
      tags: [NARRATOR],
    },
    {
      text: "You will be glad to hear that nobody was cross for long.",
      tags: [NARRATOR],
    },
    {
      text: "Nobody in the history of Marramby had ever been so polite to a radiator.",
      tags: [NARRATOR, LOOKI],
    },
    {
      text: "It was, as you have guessed, exactly the wrong moment.",
      tags: [NARRATOR],
    },
    {
      text: "I expect you have a drawer like that too, with things in it you mean to do something about.",
      tags: [NARRATOR],
    },
    {
      text: "You can tell a great deal about a town by what it loses.",
      tags: [NARRATOR],
    },
    {
      text: "Socks, if you did not know, are terrible at making decisions.",
      tags: [NARRATOR, SOCKS],
    },
    {
      text: "If you have never seen a box look embarrassed, you have missed something.",
      tags: [NARRATOR, JUMPOX],
    },
    {
      text: "It is a funny thing about lost things: they are never lost to themselves.",
      tags: [NARRATOR],
    },
    {
      text: "You might be wondering where the B was all this time, and you are not the only one.",
      tags: [NARRATOR, MISSING_B],
    },
    {
      text: 'You and I would have screamed, but Spark only said "oh".',
      tags: [NARRATOR, SPARK],
    },
    {
      text: "I can tell you now that it was the right decision, though it did not feel like one.",
      tags: [NARRATOR],
    },
    {
      text: "If you want to try looking sideways, start with something easy, like a cat.",
      tags: [NARRATOR, LOOKI],
    },
    {
      text: "This is the part where you might want to hold somebody's hand.",
      tags: [NARRATOR],
    },
    {
      text: "There is nothing quite as quiet as a shop full of clocks when all of them are listening.",
      tags: [NARRATOR, SHOP],
    },
    {
      text: "You will notice that nobody in this story ever buys a new one, and now you know why.",
      tags: [NARRATOR],
    },
    {
      text: "Mending, if you have never done it, is mostly waiting and then suddenly not.",
      tags: [NARRATOR, SPARK],
    },
    {
      text: "If a gull has ever looked at you as if you owed it money, you know how Spark felt.",
      tags: [NARRATOR, SPARK],
    },
    {
      text: "I am not going to tell you how many biscuits Looki ate, because he asked me not to.",
      tags: [NARRATOR, LOOKI],
    },
    {
      text: "You may find this hard to believe, but in the Downtheback the weather is mostly things.",
      tags: [NARRATOR, DOWNTHEBACK],
    },
    {
      text: "All of this is true, by the way, as far as anything in a book is true.",
      tags: [NARRATOR],
    },
    {
      text: "You will have noticed that Looki says sorry a great deal, and it suits him.",
      tags: [NARRATOR, LOOKI],
    },
    {
      text: "That is the trouble with fibs: they want feeding.",
      tags: [NARRATOR, SPARK],
    },
    {
      text: "You and I would probably have looked straight at him, and that would have been the end of that.",
      tags: [NARRATOR, LOOKI],
    },
    {
      text: "Mallow Street ran downhill to the sea, and on windy days the sea ran back up it.",
      tags: [STREET],
    },
    {
      text: "The houses on Mallow Street leaned together like old friends at a bus stop.",
      tags: [STREET],
    },
    {
      text: "A gull stood on the postbox at the corner and looked as if it had been posted.",
      tags: [STREET],
    },
    {
      text: "Mallow Street smelled of salt and chips and somebody's washing.",
      tags: [STREET],
    },
    {
      text: "At the bottom of Mallow Street the pavement ended and the shingle began.",
      tags: [STREET],
    },
    {
      text: "The milk float hummed down Mallow Street like a large polite bee.",
      tags: [STREET],
    },
    {
      text: "Mrs. Lomax sat on her step at number twelve and knew everything that happened on the street.",
      tags: [STREET],
    },
    {
      text: "The wind came up from the harbour and tried every door on Mallow Street.",
      tags: [STREET],
    },
    {
      text: "Somebody on Mallow Street was always painting a fence, and it was never the same fence.",
      tags: [STREET],
    },
    {
      text: "The bins on Mallow Street stood in a row every Tuesday like soldiers waiting to be inspected.",
      tags: [STREET],
    },
    {
      text: "Every front door on Mallow Street was a different colour, as if the houses had argued about it.",
      tags: [STREET],
    },
    {
      text: "A dog barked at one end of the street and another answered from the far end.",
      tags: [STREET],
    },
    {
      text: "The chip shop on the corner opened at five, and at five past the whole street smelled of vinegar.",
      tags: [STREET],
    },
    {
      text: "Mallow Street had one lamp-post that flickered, and everybody said goodnight to it.",
      tags: [STREET],
    },
    {
      text: "The summer air on Mallow Street was thick with gulls and ice-cream vans.",
      tags: [STREET],
    },
    {
      text: "A cat on a wall watched everything that happened on Mallow Street and approved of nothing.",
      tags: [STREET],
    },
    {
      text: "From the top of Mallow Street you could see the pier, the lighthouse and most of the sea.",
      tags: [STREET, PIER],
    },
    {
      text: "The pavement outside the shop had a crack shaped like a question mark.",
      tags: [STREET, SHOP],
    },
    {
      text: "Nobody on Mallow Street locked their back door, but everybody lost their keys.",
      tags: [STREET],
    },
    {
      text: "The ice-cream van played half a tune at the top of Mallow Street and half at the bottom.",
      tags: [STREET],
    },
    {
      text: "Washing lines ran between the back yards of Mallow Street like the rigging of a ship.",
      tags: [STREET],
    },
    {
      text: "Mallow Street was quiet in the mornings, apart from the gulls, who were never quiet.",
      tags: [STREET],
    },
    {
      text: "Marramby was the kind of seaside town where everybody knew which way the wind was blowing.",
      tags: [STREET],
    },
    {
      text: "In Marramby the rain came sideways, the gulls came frontways, and the buses came when they liked.",
      tags: [STREET],
    },
    {
      text: "The tide went out a very long way at Marramby, as if it were thinking of leaving.",
      tags: [PIER],
    },
    {
      text: "Marramby had a bandstand, a lifeboat, a lighthouse and a chip shop, which is all a town really needs.",
      tags: [STREET],
    },
    {
      text: "The town hall clock in Marramby was always four minutes slow, and so was the whole town.",
      tags: [STREET],
    },
    {
      text: "Amari Mends smelled of oil and dust and peppermint, in that order.",
      tags: [SHOP],
    },
    {
      text: "Clocks covered one whole wall of the shop, all ticking, none agreeing.",
      tags: [SHOP],
    },
    { text: "The shop bell rang like a teaspoon tapping a cup.", tags: [SHOP] },
    {
      text: "The workbench had a vice, a lamp, eleven jam jars of screws and a dent where Gran's elbow went.",
      tags: [SHOP],
    },
    {
      text: "Above the shop the flat was small and warm and full of things waiting to be mended.",
      tags: [SHOP],
    },
    {
      text: "The window seat was the best seat in the flat, because it had the whole street in it.",
      tags: [SHOP],
    },
    {
      text: "On the shelf behind the till sat a row of radios, each waiting its turn like a patient.",
      tags: [SHOP],
    },
    {
      text: "The shop's floorboards creaked in a pattern, and Spark knew every note.",
      tags: [SHOP],
    },
    {
      text: "Half the shop was things being mended, and the other half was things nobody had come back for.",
      tags: [SHOP],
    },
    {
      text: "The kettle in the back room had been mended so many times that it was more mend than kettle.",
      tags: [SHOP],
    },
    {
      text: "In the shop window a cuckoo clock had been waiting thirty years for someone to fetch it.",
      tags: [SHOP],
    },
    {
      text: "One drawer in the workbench was for odds and the one beside it was for ends.",
      tags: [SHOP],
    },
    {
      text: "The stairs up to the flat had fourteen steps, and the ninth one complained.",
      tags: [SHOP],
    },
    {
      text: "The shop's back door opened onto a yard with a mangle in it that nobody had dared to mend.",
      tags: [SHOP],
    },
    {
      text: "Rain on the shop window made the whole of Mallow Street look as if it were underwater.",
      tags: [SHOP, STREET],
    },
    {
      text: "The lamp over the workbench made a small warm room inside the big cold one.",
      tags: [SHOP],
    },
    {
      text: "The shop was full of ticking, so silence there sounded like a held breath.",
      tags: [SHOP],
    },
    {
      text: "A wireless on the top shelf played dance music from very far away to anyone who would listen.",
      tags: [SHOP],
    },
    {
      text: "The flat's kitchen was so small that two people had to take turns to turn round.",
      tags: [SHOP],
    },
    {
      text: "Spark's bedroom window looked out over the yard, the bins and a slice of the sea.",
      tags: [SHOP],
    },
    {
      text: "Every clock in the shop struck six at a slightly different time, so six o'clock lasted a minute.",
      tags: [SHOP],
    },
    {
      text: "The coal scuttle by the stove had never held coal in Spark's lifetime.",
      tags: [SHOP],
    },
    {
      text: "The shop sign creaked when the wind came off the sea.",
      tags: [SHOP],
    },
    {
      text: "The workbench drawer stuck, as it always had, until you lifted and pulled at the same time.",
      tags: [SHOP],
    },
    {
      text: "The shop's doormat said nothing, because the letters had worn off it years ago.",
      tags: [SHOP],
    },
    {
      text: "Brown paper parcels waited on the shelf with names on them in Gran's square writing.",
      tags: [SHOP, GRAN],
    },
    {
      text: "Marramby pier went a long way out to sea and then stopped, as if it had changed its mind.",
      tags: [PIER],
    },
    {
      text: "The boards of the pier had gaps between them, and through the gaps you could see the sea breathing.",
      tags: [PIER],
    },
    {
      text: "At the end of the pier the fishermen sat in a row like gulls with rods.",
      tags: [PIER],
    },
    {
      text: "The pier smelled of seaweed, sun cream and doughnuts.",
      tags: [PIER],
    },
    {
      text: "The wind on the pier took hats, scarves and occasionally small dogs, briefly.",
      tags: [PIER],
    },
    { text: "The deckchairs on the pier flapped like washing.", tags: [PIER] },
    {
      text: "From the end of the pier the town looked small and tidy, like a toy somebody had put away.",
      tags: [PIER],
    },
    {
      text: "The railings of the pier had gone green, and in places they had gone soft.",
      tags: [PIER],
    },
    {
      text: "On the pier the gulls walked about as if they owned it, and nobody had told them otherwise.",
      tags: [PIER],
    },
    {
      text: "The pier's lamps came on at dusk, one after another, like people remembering something.",
      tags: [PIER],
    },
    {
      text: "Under the pier the sea went slap and slap against the legs.",
      tags: [PIER],
    },
    {
      text: "Part of the way along the pier there was a bench where people sat to be sad and came away better.",
      tags: [PIER],
    },
    {
      text: "The pier rattled when the tide came in hard, like a drawer full of cutlery.",
      tags: [PIER],
    },
    {
      text: "The machine on the pier that told your weight had been telling fibs for fifty years.",
      tags: [PIER],
    },
    {
      text: "At low tide the pier stood in the sand on its long legs like a heron.",
      tags: [PIER],
    },
    {
      text: "Somebody's bucket and spade had been on the pier so long that a gull had moved in.",
      tags: [PIER],
    },
    {
      text: "The bus depot was long and echoing and smelled of oil and wet coats.",
      tags: [DEPOT],
    },
    {
      text: "The buses slept in rows at the depot, nose to tail, like cows in a shed.",
      tags: [DEPOT],
    },
    {
      text: "The lost-property box at the depot was full of gloves, umbrellas and one trombone.",
      tags: [DEPOT],
    },
    {
      text: "Under the depot roof, pigeons muttered in the rafters like passengers.",
      tags: [DEPOT],
    },
    {
      text: "The depot clock was the only clock in Marramby that was always right.",
      tags: [DEPOT],
    },
    {
      text: "Mum's bus was number eleven, and it had a squeak in the second door.",
      tags: [DEPOT, MUM],
    },
    {
      text: "In the depot canteen the tea was strong enough to stand a spoon in.",
      tags: [DEPOT],
    },
    {
      text: "At dawn the depot doors rolled open and the first bus nosed out into the grey.",
      tags: [DEPOT],
    },
    {
      text: "The depot manager kept a list of everything left on the buses, and it was a very long list.",
      tags: [DEPOT],
    },
    {
      text: "A row of drivers' caps hung on pegs in the depot like birds on a wire.",
      tags: [DEPOT],
    },
    {
      text: "The night buses came home to the depot tired and muddy and ticking as they cooled.",
      tags: [DEPOT],
    },
    {
      text: "Nobody had ever claimed the trombone, and the depot had grown fond of it.",
      tags: [DEPOT],
    },
    {
      text: "Marramby Head lighthouse stood at the end of the headland like a pencil somebody had put down.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The lighthouse had been dark for thirty years, and the town had almost stopped seeing it.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The lighthouse stairs went round and round so many times that you forgot which way was up.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "From the top of the lighthouse Marramby looked like a town drawn on a map.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The lighthouse door was green, and peeling, and much heavier than it looked.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The great lamp of the lighthouse was made of glass rings, like an onion made of light.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Gulls nested on the lighthouse gallery and complained to anybody who climbed up.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The keeper's cottage beside the lighthouse had a garden full of thrift and old rope.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "On a clear night the lighthouse beam went round the bay like a finger counting boats.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The wind at Marramby Head never stopped; it only changed its mind.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Inside the lighthouse every room was round, so there was nowhere to put a cupboard.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The lighthouse had a brass bell for fog, and on foggy nights the whole town heard it.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Somebody had painted the lighthouse white and red long ago, and the sea was still undoing it.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The Downtheback is where things go when they slip down the back of other things.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "The Downtheback smelled of sofa, which is a smell like old biscuits and pennies.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "In the Downtheback the light came from nowhere in particular, like the light inside a cupboard.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Everything in the Downtheback was waiting, and you could feel it waiting.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "The paths in the Downtheback were made of hairgrips and bus tickets, trodden flat.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Far off in the Downtheback something jingled, which was probably keys.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "The ground in the Downtheback was soft with crumbs, centuries of them.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Down here, a lost thing could sit for a hundred years and still be hoping.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "In the Downtheback, pencils grew in clumps like reeds by a river.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "The sky of the Downtheback was the underside of every sofa in the world.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "There were valleys of coins in the Downtheback, mostly small ones and mostly from long ago.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "In the Downtheback, sound came slowly, as if it had to find its way round the furniture.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "A path of jigsaw pieces led off between two hills, every piece of it sky.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Lost things in the Downtheback were kept in rough order by size, then by hope.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "The Downtheback went on further than seemed reasonable for the back of anything.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Somewhere in the Downtheback a clock was ticking, and nobody had wound it for years.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Spark's feet sank into the Downtheback the way they sink into a beach that is mostly cushions.",
      tags: [DOWNTHEBACK, SPARK],
    },
    {
      text: "A heap of lost keys in the Downtheback rang softly whenever anybody walked past.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "In the Downtheback the air was warm and still, like the inside of a coat pocket.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Every lost thing in the Downtheback had a label, written in Looki's careful hand.",
      tags: [DOWNTHEBACK, LOOKI],
    },
    {
      text: "There was a whole cliff of lost lids in the Downtheback, and not one jar to go with them.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "In the Downtheback, a sneeze echoed for a long time.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "Lost marbles rolled about the floor of the Downtheback as if they were looking for a game.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "The way back up from the Downtheback was always uphill, even when it went down.",
      tags: [DOWNTHEBACK],
    },
    {
      text: "The Hills of Odd Socks rolled away into the distance, striped and spotted and darned.",
      tags: [SOCKS],
    },
    {
      text: "Walking on the Hills of Odd Socks was like walking on a very large, very old jumper.",
      tags: [SOCKS],
    },
    {
      text: "A small landslide of socks went past, mostly grey ones, muttering.",
      tags: [SOCKS],
    },
    {
      text: "On the top of the highest sock hill a single football sock stood up like a flag.",
      tags: [SOCKS],
    },
    {
      text: "The odd socks lay about waiting for a pair, and every one of them believed it was the left.",
      tags: [SOCKS],
    },
    {
      text: "The baby socks lived in the low valleys, where it was warm.",
      tags: [SOCKS],
    },
    {
      text: "The striped socks kept to themselves and thought rather well of their stripes.",
      tags: [SOCKS],
    },
    {
      text: "A sock with a hole in its heel was telling a story to some younger socks.",
      tags: [SOCKS],
    },
    {
      text: "The socks rustled as the three of them passed, like a crowd whispering at a wedding.",
      tags: [SOCKS],
    },
    {
      text: "Somewhere in the Hills of Odd Socks there was a sock from every foot in Marramby.",
      tags: [SOCKS],
    },
    {
      text: "A sock hill is easy going up and very quick coming down.",
      tags: [SOCKS],
    },
    {
      text: "The woollen socks had elected a speaker, who mostly slept.",
      tags: [SOCKS],
    },
    {
      text: "A sock with a reindeer on it sat alone, being cheerful at nobody.",
      tags: [SOCKS],
    },
    {
      text: "Looki said that the socks were not unhappy, only undecided.",
      tags: [SOCKS, LOOKI],
    },
    {
      text: "The Button River ran slow and bright, clicking as it went.",
      tags: [BUTTONS],
    },
    {
      text: "Buttons of every colour rolled along in the Button River, the big ones sinking and the small ones floating.",
      tags: [BUTTONS],
    },
    {
      text: "The banks of the Button River were lined with toggles, like pebbles on a beach.",
      tags: [BUTTONS],
    },
    {
      text: "Brass buttons gleamed at the bottom of the river like fish.",
      tags: [BUTTONS],
    },
    {
      text: "The Button River made a sound like a hundred people knitting.",
      tags: [BUTTONS],
    },
    {
      text: "There was a ford across the Button River made of coat buttons, the big wooden kind.",
      tags: [BUTTONS],
    },
    {
      text: "Spark put her hand into the Button River and it came out holding three buttons and a press stud.",
      tags: [BUTTONS, SPARK],
    },
    {
      text: "In the shallows of the Button River the shirt buttons lay in drifts, white and pearly.",
      tags: [BUTTONS],
    },
    {
      text: "The river had a waterfall where it went over the edge of a lost suitcase.",
      tags: [BUTTONS],
    },
    {
      text: "Every button in the Button River had come off at exactly the wrong moment.",
      tags: [BUTTONS],
    },
    { text: "The Button River smelled faintly of cardigans.", tags: [BUTTONS] },
    {
      text: "A small brown button had been going round the same bend of the river for forty years.",
      tags: [BUTTONS],
    },
    {
      text: "Looki crossed the Button River on stepping stones that were really very large buttons off a very large coat.",
      tags: [BUTTONS, LOOKI],
    },
    {
      text: "The Umbrella Forest opened and closed all around them, like slow breathing.",
      tags: [UMBRELLAS],
    },
    {
      text: "The umbrellas in the forest stood on their points, black and spotted and flowered.",
      tags: [UMBRELLAS],
    },
    {
      text: "In the Umbrella Forest it was always about to rain, and never quite did.",
      tags: [UMBRELLAS],
    },
    {
      text: "A tall striped umbrella swayed above the others like an old tree.",
      tags: [UMBRELLAS],
    },
    {
      text: "The little children's umbrellas grew at the edge of the forest, with ducks and frogs on them.",
      tags: [UMBRELLAS],
    },
    {
      text: "When the wind went through the forest, every umbrella turned inside out and then politely turned back.",
      tags: [UMBRELLAS],
    },
    {
      text: "The floor of the Umbrella Forest was covered in fallen spokes, like pine needles.",
      tags: [UMBRELLAS],
    },
    {
      text: "Looki said that you must never open an umbrella in the forest, as it is rude to the others.",
      tags: [UMBRELLAS, LOOKI],
    },
    {
      text: "Somewhere in the forest an umbrella was creaking open, very slowly, like a yawn.",
      tags: [UMBRELLAS],
    },
    {
      text: "The Umbrella Forest was dark in the middle, where the biggest umbrellas met overhead.",
      tags: [UMBRELLAS],
    },
    {
      text: "Spark found a path between the umbrellas by following the drips.",
      tags: [UMBRELLAS, SPARK],
    },
    {
      text: "An umbrella with a broken rib leaned against another, and the other held it up.",
      tags: [UMBRELLAS],
    },
    {
      text: "The Hall of Spectacles was long and bright and lined with shelves, and every shelf was looking at them.",
      tags: [SPECTACLES],
    },
    {
      text: "Thousands of spectacles lay folded on the shelves, each pair facing the door.",
      tags: [SPECTACLES],
    },
    {
      text: "In the Hall of Spectacles the light bounced from lens to lens until the air sparkled.",
      tags: [SPECTACLES],
    },
    {
      text: "Some spectacles were round, some were square, and some were the shape of surprise.",
      tags: [SPECTACLES],
    },
    {
      text: "The sunglasses sat on a shelf of their own and pretended not to care.",
      tags: [SPECTACLES],
    },
    {
      text: "The reading glasses were kept nearest the door, because they were the most often missed.",
      tags: [SPECTACLES],
    },
    {
      text: "In the Hall of Spectacles Spark felt as if she were being read.",
      tags: [SPECTACLES, SPARK],
    },
    {
      text: "A pair of half-moon glasses winked at her from a high shelf.",
      tags: [SPECTACLES],
    },
    {
      text: "Looki dusted each pair of spectacles as he passed, with a handkerchief he kept for the purpose.",
      tags: [SPECTACLES, LOOKI],
    },
    {
      text: "Every pair in the Hall of Spectacles had once been pushed up onto somebody's head and forgotten.",
      tags: [SPECTACLES],
    },
    {
      text: "The Lost Bandstand stood in a clearing of the Downtheback, its paint peeling, its music stands still up.",
      tags: [BANDSTAND],
    },
    {
      text: "Nobody knew which town the Lost Bandstand had come from, and the bandstand was not saying.",
      tags: [BANDSTAND],
    },
    {
      text: "Under the roof of the Lost Bandstand the rain sounded like applause.",
      tags: [BANDSTAND],
    },
    {
      text: "The music on the stands of the Lost Bandstand was so old the notes had faded to dots.",
      tags: [BANDSTAND],
    },
    {
      text: "A drum with no drummer sat in the middle of the Lost Bandstand, waiting for a beat.",
      tags: [BANDSTAND],
    },
    {
      text: "The Lost Bandstand had eight sides, and from every side it looked lonely.",
      tags: [BANDSTAND],
    },
    {
      text: "The bandstand's floor still had chalk marks where the band had stood.",
      tags: [BANDSTAND],
    },
    {
      text: "Mr. Dustin Pann's office was perfectly empty and perfectly clean.",
      tags: [OFFICE, DUSTIN],
    },
    {
      text: "The office held one chair, one desk and one clock, and the clock was dusted twice a day.",
      tags: [OFFICE],
    },
    {
      text: "The office walls were so white that Spark could hear them.",
      tags: [OFFICE, SPARK],
    },
    {
      text: "The floor of the office had been swept so often it shone like a frozen pond.",
      tags: [OFFICE],
    },
    {
      text: "A single pencil lay on the desk in the office, exactly parallel to the edge.",
      tags: [OFFICE],
    },
    {
      text: "The office had a window that looked out on nothing, and the glass was spotless.",
      tags: [OFFICE],
    },
    {
      text: "On the office door a brass plate said Chief Tidier, polished until it was hard to read.",
      tags: [OFFICE],
    },
    {
      text: "The office was very quiet, the way a room is quiet when nobody ever visits.",
      tags: [OFFICE],
    },
    {
      text: "In the corner of the office a broom stood upright, like a guard who has forgotten why.",
      tags: [OFFICE],
    },
    {
      text: "Nobody knew what the Nothing-Much was like, because nothing ever came back from it.",
      tags: [NOTHING, SWEEP],
    },
    {
      text: "Looki would not even say the name of the Nothing-Much, and spelled it instead.",
      tags: [NOTHING, SWEEP, LOOKI],
    },
    {
      text: "The Nothing-Much was beyond the last hill of the Downtheback, and nobody went that far.",
      tags: [NOTHING, SWEEP],
    },
    {
      text: "Spark imagined the Nothing-Much as a cupboard with no back and no front.",
      tags: [NOTHING, SWEEP, SPARK],
    },
    {
      text: "The two screw holes on the brass plate were tiny and neat, and a hundred years empty.",
      tags: [MISSING_B],
    },
    {
      text: "Spark measured the gap on the plate with Gran's callipers and wrote the answer on her wrist.",
      tags: [MISSING_B, SPARK],
    },
    {
      text: "Without its B, Jumpox could jump but not box, so nobody could go all the way home.",
      tags: [MISSING_B, JUMPOX],
    },
    {
      text: "Every time Spark said the word box, Jumpox gave a small sad creak.",
      tags: [MISSING_B, JUMPOX],
    },
    {
      text: "Spark looked for the B in every drawer of the shop, and found three thimbles instead.",
      tags: [MISSING_B, SPARK],
    },
    {
      text: '"A B is not a small thing," said Looki, "not if it is your B."',
      tags: [MISSING_B, LOOKI],
    },
    {
      text: "A brass B, Spark reckoned, would be the size of a postage stamp, and twice as easy to lose.",
      tags: [MISSING_B, SPARK],
    },
    {
      text: "Spark found a great many brass things that summer, and none of them was a B.",
      tags: [MISSING_B, SPARK],
    },
    {
      text: '"It is somewhere," said Looki firmly. "Everything is somewhere."',
      tags: [MISSING_B, LOOKI],
    },
    {
      text: "Spark drew the B on the back of an envelope so she would know it when she saw it.",
      tags: [MISSING_B, SPARK],
    },
    {
      text: "Spark could have cut a new B in ten minutes, and they were the hardest ten minutes she never spent.",
      tags: [MISSING_B, SPARK],
    },
    {
      text: "The letter B, Spark thought, was a strange letter to lose, being mostly two bellies.",
      tags: [MISSING_B, SPARK],
    },
    {
      text: "The notice about the Great Sweep was written in the neatest handwriting Spark had ever seen.",
      tags: [SWEEP],
    },
    {
      text: "Looki would not say the word Sweep after dark.",
      tags: [SWEEP, LOOKI],
    },
    {
      text: "The nights were getting fewer, and Spark counted them on the calendar in the kitchen.",
      tags: [SWEEP, SPARK],
    },
    {
      text: "Every night Spark crossed off another day, and the crosses marched across the month like footprints.",
      tags: [SWEEP, SPARK],
    },
    {
      text: "Looki's ears went flat whenever anybody mentioned the Sweep, even in passing.",
      tags: [SWEEP, LOOKI],
    },
    {
      text: "On the last night of the summer, everything nobody was looking for would be swept away for good.",
      tags: [SWEEP],
    },
    {
      text: "In the Downtheback the lost things huddled closer together, as if they had heard the news.",
      tags: [SWEEP, DOWNTHEBACK],
    },
    {
      text: "Spark lay awake doing sums: so many things, so few nights, and only one Finder.",
      tags: [SWEEP, SPARK],
    },
    {
      text: "A broom leaned against the wall of the Downtheback, waiting for its night.",
      tags: [SWEEP, DOWNTHEBACK],
    },
    {
      text: "Looki worked faster after the notice went up, and apologised to everything twice as much.",
      tags: [SWEEP, LOOKI],
    },
    {
      text: "The summer, which had seemed so long at the start, was suddenly in a hurry.",
      tags: [SWEEP],
    },
    {
      text: "Jumpox took to sleeping with its lid open a crack, as if it did not like to miss anything.",
      tags: [SWEEP, JUMPOX],
    },
    {
      text: "Spark had never minded the end of the summer before.",
      tags: [SWEEP, SPARK],
    },
    {
      text: "A hush had fallen over the Downtheback, the hush of a classroom before a test.",
      tags: [SWEEP, DOWNTHEBACK],
    },
    {
      text: "The six letters to Dot lay in the drawer under the rabbit jumper, and Spark knew exactly where.",
      tags: [LETTERS, SPARK],
    },
    {
      text: "Spark thought about the letters at night, which is when letters are heaviest.",
      tags: [LETTERS, SPARK],
    },
    {
      text: "Dot had moved to the city at the start of the summer, a long way off by bus.",
      tags: [LETTERS],
    },
    {
      text: "Spark could mend a clock in an afternoon, but she could not post a letter.",
      tags: [LETTERS, SPARK],
    },
    {
      text: "There were six letters, and every one of them had a stamp on it already.",
      tags: [LETTERS],
    },
    {
      text: "Spark walked past the postbox on the corner and did not look at it.",
      tags: [LETTERS, SPARK],
    },
    {
      text: "Spark wondered whether Dot had a window seat in the city.",
      tags: [LETTERS, SPARK],
    },
    {
      text: "The postbox at the corner of Mallow Street had a mouth like a surprised person.",
      tags: [LETTERS, STREET],
    },
    {
      text: "Spark had the feeling, which she did not like, that the drawer under the rabbit jumper was listening.",
      tags: [LETTERS, SPARK],
    },
    {
      text: "Looki was careful not to mention the letters, and was very bad at it.",
      tags: [LETTERS, LOOKI],
    },
    {
      text: "Gran knew more than she said, which was true of most things and especially of this.",
      tags: [SECRET, GRAN],
    },
    {
      text: "Gran looked sideways at the window seat, and her mouth went small, as if it held a pin.",
      tags: [SECRET, GRAN],
    },
    {
      text: "Gran set out three cups for tea, and then put one back, and then took it out again.",
      tags: [SECRET, GRAN],
    },
    {
      text: '"When I was your age," Gran began, and then she stopped and wound a clock instead.',
      tags: [SECRET, GRAN],
    },
    {
      text: "The Book of Missing was as thick as a doorstep and smelled of pencil shavings.",
      tags: [LEDGER, LOOKI],
    },
    {
      text: "Looki wrote each lost thing in the ledger with the name of whoever had lost it, always.",
      tags: [LEDGER, LOOKI],
    },
    {
      text: "The pages of The Book of Missing were so full that the writing went up the margins.",
      tags: [LEDGER],
    },
    {
      text: "Looki crossed out the entry with one straight line, so that it could still be read.",
      tags: [LEDGER, LOOKI],
    },
    {
      text: "Some entries in the ledger were so old that the ink had gone the colour of tea.",
      tags: [LEDGER],
    },
    {
      text: "Looki licked the end of his pencil before he wrote anything important.",
      tags: [LEDGER, LOOKI],
    },
    {
      text: "Every crossed-out line in The Book of Missing was somebody who had been made a little bit happier.",
      tags: [LEDGER],
    },
    {
      text: "Spark liked to read the ledger at bedtime, the way some people read the dictionary.",
      tags: [LEDGER, SPARK],
    },
    {
      text: "The Book of Missing had a ribbon to mark the page, and the ribbon itself had once been lost.",
      tags: [LEDGER],
    },
    {
      text: "Looki closed the ledger with both hands, as gently as you close a door on a sleeping baby.",
      tags: [LEDGER, LOOKI],
    },
    {
      text: "The ledger listed every lost thing in Marramby, and some in other towns, and one, mysteriously, at sea.",
      tags: [LEDGER],
    },
    {
      text: "Looki read the entries aloud like a station announcer, all the way down the page.",
      tags: [LEDGER, LOOKI],
    },
    {
      text: "People in Marramby had started looking behind things, though nobody could have said why.",
      tags: [NOTICING],
    },
    {
      text: "On Mallow Street, three people in one morning took the cushions off their sofas.",
      tags: [NOTICING, STREET],
    },
    {
      text: "Mrs. Lomax said the whole street was turning out its drawers, and she was not complaining.",
      tags: [NOTICING, STREET],
    },
    {
      text: "A man on the pier looked under the benches for something he had lost as a boy.",
      tags: [NOTICING, PIER],
    },
    {
      text: "The chip shop put a box on the counter for found things, and it filled up in a day.",
      tags: [NOTICING],
    },
    {
      text: 'All over Marramby, people were saying, "Now where did I put that?" and then going to look.',
      tags: [NOTICING],
    },
    {
      text: "Children in Marramby had taken to looking sideways at things, because it was the new game.",
      tags: [NOTICING],
    },
    {
      text: "Nobody in town knew about Finders, but they had all begun to look, and that was enough.",
      tags: [NOTICING],
    },
    {
      text: "The newsagent put a notice in his window that said LOST AND FOUND, and under it, ASK INSIDE.",
      tags: [NOTICING],
    },
    {
      text: "The town was full of the sound of drawers being opened and sofas being pulled out.",
      tags: [NOTICING],
    },
    {
      text: "In the café on the front, people swapped stories about things they had found, and the stories got better each time.",
      tags: [NOTICING],
    },
  ],
});
