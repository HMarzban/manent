// The phrase bank of the Ned Ashby book, in its voice.
import type { ProseGuide } from "../../guide.ts";

const NED = "Ned";
const HATTIE = "Hattie";
const VELLE = "Magister Velle";
const CRANE = "Alderman Crane";
const MAUD = "Maud";
const WICK = "Old Wick";
const TALLOW = "Tallow";

const CANDLEMERE = "Candlemere";
const TOWER = "the Lantern Tower";
const HALL = "the Guild Hall";
const WARD = "the Fourth Ward";
const GLASSWORKS = "the Glassworks";
const LIGHTHOUSE = "Old Wick's lighthouse";

const AFTERGLOW = "the afterglow";
const FLAME = "the flame burning down";
const SECRET = "the Guild's secret";
const MAINS = "the gas mains";
const MINUTES = "the lost minutes";
const FIRST_LIGHTING = "the first lighting";

export const NED_PROSE: ProseGuide = Object.freeze({
  project: "ned-ashby-prose",
  names: [
    "Ned Ashby",
    "Hattie Price",
    "Magister Cora Velle",
    "Alderman Silas Crane",
    "Maud Ashby",
    "Old Wick",
    "Tallow",
    "Candlemere",
    "Lantern Tower",
    "Guild Hall",
    "Guild of Lamplighters",
    "Warden",
    "Fourth Ward",
    "First Ward",
    "Second Ward",
    "Glassworks",
    "Hours",
    "Cinder Row",
    "Ladder Lane",
    "Snuff Street",
    "Mistress Brakewell",
    "Mrs. Larkworthy",
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
      title: "The Moth in the Lamp-Glass",
      beats: [
        "At dusk Ned steadied his mother's ladder on Ladder Lane while Maud lit the Fourth Ward lamp by lamp.",
        "A cracked lamp-glass buzzed, and Ned prised it open to free a moth the size of a sparrow.",
        "The moth shook off its soot, chose Ned's cap to sit on, and would not be shooed.",
        "Ned saw the afterglow of a lamp that had been dark since spring and said nothing, as he had been taught.",
        "The Lantern Tower struck six, and the last stroke came late, as if it had stopped to think.",
        "Maud named the moth Tallow on the walk home, because it was the colour of a good candle.",
      ],
      ledger:
        "Night of the first. Flame at the thirtieth mark. Six struck a breath late. Velle.",
      tags: [WARD, AFTERGLOW, MINUTES],
    },
    {
      number: 2,
      title: "Four Minutes Short",
      beats: [
        "Over soup Maud repeated the family rule: an Ashby lights lamps and does not talk about what lamps leave behind.",
        "Tallow lifted the lid off the jam jar Ned had put it in and walked out across the bread.",
        "Ned lay awake with his boots on and counted every stroke of the tower until midnight.",
        "He scratched a tally on the wall by his bed and found the night four minutes short.",
        "He counted the tally three more times, then woke his mother, who told him to count sheep instead.",
        "By morning the baker on Cinder Row was complaining that his loaves had not had time to rise.",
      ],
      ledger:
        "Night of the second. Flame steady. Midnight struck four minutes short. Velle.",
      tags: [WARD, MINUTES, AFTERGLOW],
    },
    {
      number: 3,
      title: "Four Breaths",
      beats: [
        "Ned ran to the Glassworks, where Hattie Price was blowing lamp-glasses at the third furnace.",
        "Hattie finished a lamp-glass in four breaths and listened to it ring before she looked up.",
        "Ned told her about the tally and the short night, and she believed him before he had finished.",
        "Mistress Brakewell bellowed the hour, and the whole floor checked it against the tower.",
        "Hattie timed a cooling glass against the furnace clock and showed Ned that the hour had struck early.",
        "They agreed to climb the Lantern Tower that night and look at the flame for themselves.",
      ],
      ledger:
        "Night of the third. Flame down a hair. The Glassworks sent word their hour came early. Velle.",
      tags: [GLASSWORKS, MINUTES],
    },
    {
      number: 4,
      title: "The Coal Chute",
      beats: [
        "Ned told his mother he was sleeping at Hattie's, which was the first fib he had told her in a year.",
        "The two of them crossed Candlemere after the last round, keeping to the shadows of the new gas trenches.",
        "The tower door was locked, but the coal chute beside it had not been locked in living memory.",
        "Hattie went down the chute first and landed in the coal with a word she had learned at the furnace.",
        "A guard came past yawning, and Tallow dimmed its own glow until he had gone.",
        "At the foot of the stairs a brass plate named the first Warden and the year the Lantern was lit.",
      ],
      ledger:
        "Night of the fourth. Coal chute found open. Nothing taken but coal dust. Velle.",
      tags: [CANDLEMERE, TOWER, MAINS],
    },
    {
      number: 5,
      title: "Six Hundred Steps",
      beats: [
        "The stairs wound up into the dark, worn into dips by six hundred years of lamplighters' boots.",
        "Every hundred steps a brass plate gave the name of a Warden, and Hattie read each one aloud.",
        "Ned counted steps until Hattie asked him, kindly, to count something else.",
        "Halfway up the air grew warm and smelled of wax, iron and something like burnt sugar.",
        "Ned saw afterglow on the steps, thin as chalk, as if a thousand lamplighters had climbed with lit wicks.",
        "At the top a door stood open a crack, and gold light ran under it like syrup.",
      ],
      ledger:
        "Night of the fifth. Footprints in the soot on every hundredth step. Velle.",
      tags: [TOWER, AFTERGLOW, FIRST_LIGHTING],
    },
    {
      number: 6,
      title: "The Scorch Marks",
      beats: [
        "The flame chamber was round, bare and hot, and the Lantern burned in the middle of it in a cage of brass.",
        "The flame was tall and steady and lovely, and it stood a third short of the scorch marks above it.",
        "Hattie measured the gap with her blowpipe and did the sums twice on the back of her hand.",
        "Ned saw that the flame left no afterglow at all, and that frightened him more than the gap.",
        "Tallow flew three slow circles round the cage and would not go near the flame.",
        "A voice behind them asked, quite politely, what two children were doing in the Warden's chamber.",
      ],
      ledger:
        "Night of the sixth. Two children in the chamber. Flame at the twenty-ninth mark. Velle.",
      tags: [TOWER, FLAME],
    },
    {
      number: 7,
      title: "The Warden's Warning",
      beats: [
        "Magister Cora Velle stood in the doorway in her night robe with a lamp in one hand and a book under her arm.",
        "She asked their names, wrote them down, and did not once look at the flame.",
        "Ned asked her straight out whether the Lantern was going out, and she told him lanterns do not go out.",
        "She walked them down all six hundred steps herself, talking about the weather the whole way.",
        "At the door she warned them that the tower was Guild ground, and the Guild did not forgive twice.",
        "Ned noticed she had closed the book before he could read it, and that her hands were shaking.",
      ],
      ledger:
        "Night of the seventh. Names taken: Ned Ashby, Hattie Price. No further action. Velle.",
      tags: [TOWER, SECRET],
    },
    {
      number: 8,
      title: "The Alderman's Model",
      beats: [
        "Alderman Silas Crane put his gas mains to the city council with a model of Candlemere made of tin.",
        "At the turn of a tap every tin street lit at once, and half the council clapped before they could stop themselves.",
        "Ned and Hattie watched from the public gallery, squeezed between a chimney sweep and a woman with a goose.",
        "Magister Velle stood to defend the Lantern and lost her temper once, which the council talked about for weeks.",
        "Crane said a city should not keep its time by one flame in one tower, and nobody could think of an answer.",
        "The vote was put off a fortnight, and Crane bowed to the gallery as if the gallery had voted.",
      ],
      ledger:
        "Night of the eighth. Council heard the Alderman. Flame unmoved by argument. Velle.",
      tags: [CANDLEMERE, MAINS],
    },
    {
      number: 9,
      title: "What Maud Heard",
      beats: [
        "Maud went to the Guild Hall to renew her oath, as every lamplighter did at the turn of the quarter.",
        "Waiting in the cloakroom, she heard two Guild masters arguing behind a door that did not quite shut.",
        "One of them said the Warden had measured the flame falling for a year and told nobody.",
        "Maud took the oath anyway, word for word, with her hand on the old brass lamp.",
        "She walked home the long way round and lit three lamps that were not on her round.",
        "At supper she told Ned the Guild knew what it was doing, and he could tell she did not believe it.",
      ],
      ledger:
        "Night of the ninth. Quarter oaths renewed, forty-one. Flame at the twenty-eighth mark. Velle.",
      tags: [HALL, SECRET, WARD],
    },
    {
      number: 10,
      title: "Hours Go Missing",
      beats: [
        "Candlemere began to lose minutes the way a coat loses buttons, one at a time and then several at once.",
        "The market opened in the dark because the hour had struck before the sun was ready.",
        "Mrs. Larkworthy's loaves came out of the oven flat, and she complained to the tower in writing.",
        "The clockmakers of Snuff Street set their clocks by the tower, then by each other, then gave up.",
        "Crane's men put up posters saying that gas does not lose time, which was not quite true but sounded it.",
        "Ned's tally on his bedroom wall ran out of wall.",
      ],
      ledger:
        "Night of the tenth. Eleven minutes lost since the first. Bakers complaining. Velle.",
      tags: [CANDLEMERE, MINUTES, MAINS],
    },
    {
      number: 11,
      title: "The Second Stamp",
      beats: [
        "Mistress Brakewell set Hattie to clearing the old Guild moulds from the back of the shed as a punishment.",
        "Under a century of dust, one mould carried the Guild's lantern stamp and, beneath it, a second stamp shaped like a wick.",
        "Hattie blew a glass into the old mould to see what it made, and it came out a size no lamp in Candlemere used.",
        "Scratched beside the second stamp, in letters small enough to miss, was a single name: Wick.",
        "Ned held the new glass up to the furnace and saw afterglow pooling inside it like water in a cup.",
        "They hid the glass in Hattie's apron and walked out past the foreman, whistling badly.",
      ],
      ledger:
        "Night of the eleventh. Flame bluish at the root. No cause found. Velle.",
      tags: [GLASSWORKS, FIRST_LIGHTING, AFTERGLOW],
    },
    {
      number: 12,
      title: "A Name in the Glass",
      beats: [
        "Ned asked his mother who Wick was, and she dropped a whole box of wicks on the kitchen floor.",
        "The Guild Hall library kept a record of every lamplighter ever sworn, and one page had been cut out with a knife.",
        "The librarian, who was very old, told them the name was not spoken in the Hall, and then spoke it twice.",
        "Old Wick, he said, had been thrown out sixty years ago for asking what the Lantern burns.",
        "Hattie asked what it does burn, and the librarian said that was exactly the question.",
        "On the way home they passed the tower, and the flame looked smaller from the street than it had any right to.",
      ],
      ledger:
        "Night of the twelfth. Someone asked the library for the cut page. Velle.",
      tags: [HALL, SECRET, FIRST_LIGHTING],
    },
    {
      number: 13,
      title: "In Front of Everybody",
      beats: [
        "On quarter night the whole Guild met in the Guild Hall, and Ned walked in without being sworn.",
        "He stood on a bench and told three hundred lamplighters that the Lantern was burning down.",
        "Nobody laughed, which was worse than laughing.",
        "Maud stood up at the back and said her son did not tell lies, then sat down very red.",
        "Magister Velle closed the meeting and asked Ned and Hattie to wait in her study.",
        "Alderman Crane, who was not a member and had come in with the coal delivery, took notes.",
      ],
      ledger:
        "Night of the thirteenth. The Ashby boy spoke in the Hall. He was right. Velle.",
      tags: [HALL, SECRET, FLAME],
    },
    {
      number: 14,
      title: "The Warden's Study",
      beats: [
        "The Warden's study was full of clocks, and every one of them was set to a different time.",
        "Magister Velle opened the watch book and showed them a year of measurements, each night a hair lower.",
        "She had told nobody because the guild oath forbade any word against the Lantern.",
        "Hattie asked what would happen when the flame reached the bottom, and Velle said there would be no more hours.",
        "Ned asked who first lit it, and Velle said only one living person had ever tried to find out.",
        "She wrote his direction on a scrap of paper and asked them not to tell her if they went.",
      ],
      ledger:
        "Night of the fourteenth. Showed the book to two children. Flame at the twenty-sixth mark. Velle.",
      tags: [HALL, SECRET, FLAME],
    },
    {
      number: 15,
      title: "Why Old Wick Was Sent Away",
      beats: [
        "Velle told them that sixty years ago an apprentice called Wick had asked the Guild what the Lantern burns.",
        "The Guild said it burns because it is kept, and Wick said that was an answer to a different question.",
        "He climbed the tower at night to find out, and was caught with a lamp-glass of his own making.",
        "The Guild took his pole, his oath and his name, and he walked out of the city across the mudflats.",
        "Velle had been an apprentice then too, and she had voted with everyone else.",
        "She said she had been sorry for sixty years, which, Hattie said later, was a very long time to be sorry.",
      ],
      ledger:
        "Night of the fifteenth. Told them about Wick. Sixty years too late. Velle.",
      tags: [HALL, SECRET, FIRST_LIGHTING],
    },
    {
      number: 16,
      title: "The Mudflats",
      beats: [
        "Ned and Hattie set off at low tide with bread, cheese, a lamp, and Tallow riding on Hattie's hat.",
        "The mudflats went on for miles, flat as a tray, with the city behind them shrinking to a candle.",
        "They lost a boot each to the mud and agreed not to talk about it.",
        "At the far edge stood a lighthouse that nobody in Candlemere admitted was there.",
        "It was built of salvage: ship's timbers, a cart wheel, a hundred odd windows and a front door from somebody's house.",
        "The light at its top was small and steady, and it threw an afterglow Ned could see from a mile off.",
      ],
      ledger:
        "Night of the sixteenth. A light seen on the mudflats, small and steady. Velle.",
      tags: [CANDLEMERE, LIGHTHOUSE, AFTERGLOW],
    },
    {
      number: 17,
      title: "A Lighthouse Made of Salvage",
      beats: [
        "Old Wick opened the door before they knocked and told them to wipe their feet, which was hopeless.",
        "He set them to work before he let them talk: Ned trimming wicks, Hattie mending a cracked glass.",
        "He was well over ninety, with a beard tucked into his belt so it would not catch fire.",
        "When Ned stopped to stare at the afterglow on the stairs, Old Wick asked him how long he had seen it.",
        "Ned said always, and Old Wick said so had he, and that was why he had asked his question.",
        "They ate supper by the light of the lamp at the top, and nobody said anything for quite a while.",
      ],
      ledger:
        "Night of the seventeenth. Flame at the twenty-fifth mark. The Ashby boy did not come home. Velle.",
      tags: [LIGHTHOUSE, AFTERGLOW],
    },
    {
      number: 18,
      title: "What the Lantern Burns",
      beats: [
        "Old Wick told them the Lantern burns afterglow: the light left behind by every lamp lit by hand in Candlemere.",
        "Each time a lamplighter lit a lamp, a little of its light drifted up to the tower and fed the flame.",
        "Fewer lamps were lit by hand every year, with three wards already on gas, and the flame was going hungry.",
        "Hattie said that made Alderman Crane half right, and Old Wick said half right was the most dangerous kind.",
        "Ned asked whether the flame could be lit again from nothing, and Old Wick said not from nothing, from afterglow.",
        "The only people who could see enough afterglow to do it were sitting at his table.",
      ],
      ledger:
        "Night of the eighteenth. Three wards on gas. Flame hungry. Velle.",
      tags: [LIGHTHOUSE, AFTERGLOW, FLAME, MAINS],
    },
    {
      number: 19,
      title: "Crane's Trenches",
      beats: [
        "When they got home, Crane's men had dug a trench down the middle of the Fourth Ward.",
        "The vote had not yet been held, but Crane said a trench was not a vote, merely a hole.",
        "Maud stood on the edge of the trench and lit every lamp along it, slowly, in front of the diggers.",
        "One digger lit his pipe from her pole and thanked her, and Crane fined him a shilling.",
        "That night the flame dropped two marks, and the city lost another quarter of an hour.",
        "Ned told his mother everything Old Wick had said, and she listened without stopping him once.",
      ],
      ledger:
        "Night of the nineteenth. A trench through the Fourth Ward. Flame down two marks. Velle.",
      tags: [WARD, MAINS, FLAME],
    },
    {
      number: 20,
      title: "The Lost Hour",
      beats: [
        "At midnight the Lantern guttered, and the city woke at what should have been one o'clock to find it was two.",
        "A whole hour had gone, and nobody could agree what had been in it.",
        "People came out in their nightclothes to argue with the tower, which said nothing.",
        "The council met at dawn, and Crane's vote passed by one, because one councillor had overslept.",
        "Work on the mains would begin in every ward within the week.",
        "Magister Velle sent Maud a note asking that the Fourth Ward be kept lit by hand, every lamp, every night.",
      ],
      ledger:
        "Night of the twentieth. Midnight guttered. One hour lost entire. Velle.",
      tags: [CANDLEMERE, MINUTES, FLAME, MAINS],
    },
    {
      number: 21,
      title: "Every Lamp by Hand",
      beats: [
        "Maud kept every lamp in the Fourth Ward lit by hand, and lit some twice for good measure.",
        "Ned ran between the lamps with the spare pole, relighting any the wind put out.",
        "Neighbours who had never thought about lamps came out with tapers and asked to be shown how.",
        "By the third night half of Ladder Lane was lighting its own doorsteps, badly but with feeling.",
        "Ned watched afterglow rise from every street and drift towards the tower like smoke going the wrong way.",
        "For the first time in a year, the flame did not drop at all.",
      ],
      ledger:
        "Night of the twenty-first. Fourth Ward lit by hand, every lamp. Flame held. Velle.",
      tags: [WARD, AFTERGLOW, FLAME],
    },
    {
      number: 22,
      title: "Maud Sees It Too",
      beats: [
        "Climbing down from the last lamp, Maud admitted that she used to see the afterglow when she was a girl.",
        "She had stopped mentioning it at twelve, then stopped seeing it, and had never been sure which came first.",
        "That was why she had told Ned never to speak of it: she had wanted him to keep it.",
        "Ned said he would rather keep it out loud.",
        "Maud laughed for the first time in a week and nearly fell off the ladder.",
        "Tallow settled on her shoulder instead of Ned's, which neither of them remarked on.",
      ],
      ledger:
        "Night of the twenty-second. Flame held a second night. The Fourth Ward is lighting its doorsteps. Velle.",
      tags: [WARD, AFTERGLOW],
    },
    {
      number: 23,
      title: "The First Lighting",
      beats: [
        "Ned went back across the mudflats alone at low tide, with a lamp and a list of questions.",
        "Old Wick taught him the first lighting, which turned out to be a craft and not a secret at all.",
        "It needed a new wick, a glass blown to the old measure, and somebody who could see afterglow to light it from.",
        "Ned practised for three days on candle stubs, lighting each one from the afterglow of the one before.",
        "He burned his fingers eleven times and his eyebrows once.",
        "On the third night he lit a candle from the afterglow of a candle that had gone out a week ago.",
      ],
      ledger:
        "Night of the twenty-third. Candle smoke seen over the mudflats, three nights running. Velle.",
      tags: [LIGHTHOUSE, FIRST_LIGHTING, AFTERGLOW],
    },
    {
      number: 24,
      title: "Hattie's Measure",
      beats: [
        "Hattie took Old Wick's measure, scratched on the back of a biscuit tin, to the furnace after hours.",
        "The glass had to be thinner than any lamp-glass the Glassworks made, and it broke eleven times.",
        "Mistress Brakewell caught her on the twelfth try, watched in silence, and fetched better sand.",
        "On the fourteenth breath, not the fourth, the glass held, and it rang a note so high only Tallow heard it.",
        "Hattie wrapped it in four aprons and walked it across the city as if it were an egg.",
        "The foreman wrote in the Glassworks book that one lamp-glass had been lost, which was a kindness.",
      ],
      ledger:
        "Night of the twenty-fourth. The Glassworks reports one lamp-glass lost. Velle.",
      tags: [GLASSWORKS, FIRST_LIGHTING],
    },
    {
      number: 25,
      title: "The Braided Wick",
      beats: [
        "Maud came across the mudflats in a borrowed boat to fetch Ned home, and arrived angry and soaked.",
        "Old Wick gave her a towel, a cup of tea and a wick to braid, in that order.",
        "She braided faster than he could, and he said so, and she said she had had a lot of practice.",
        "The new wick had to be braided from threads of every ward's old wicks, and Maud knew every ward.",
        "By midnight the wick was done, and Maud held Hattie's glass steady while Old Wick fitted the brass.",
        "She did not take Ned home; she took all four of them back to the city.",
      ],
      ledger:
        "Night of the twenty-fifth. Maud Ashby took a boat out at dusk. Ward lit by neighbours. Velle.",
      tags: [LIGHTHOUSE, FIRST_LIGHTING],
    },
    {
      number: 26,
      title: "The Last Night of the Flame",
      beats: [
        "The mains were turned on in six wards at once, and the Lantern dropped to its last mark.",
        "Across Candlemere the gas lamps burned bright and even and left no afterglow at all.",
        "The hours began to strike at random, and some streets heard eleven while others heard none.",
        "Velle kept watch in the flame chamber alone, shielding the flame with her own hands.",
        "At the foot of the tower the Guild masters barred the door, as the oath required.",
        "Ned, Hattie, Maud and Old Wick arrived with the new wick, the new glass and no permission.",
      ],
      ledger:
        "Night of the twenty-sixth. Six wards on gas. Flame at the last mark. Kept by hand. Velle.",
      tags: [TOWER, FLAME, MAINS, MINUTES],
    },
    {
      number: 27,
      title: "The Alderman Holds the Door",
      beats: [
        "The Guild masters refused to let Old Wick into the tower, emergency or no emergency.",
        "Alderman Crane, of all people, arrived in his best coat and asked what the trouble was.",
        "When he understood that the flame was about to go out, he said that would be very bad for business.",
        "He held the side door open with his own shoulder while the masters argued about precedence.",
        "Hattie went through with the glass, Maud with the wick, and Ned with Tallow on his cap.",
        "Old Wick stopped at the threshold, because he had sworn sixty years ago never to set foot in the tower again.",
      ],
      ledger:
        "Night of the twenty-seventh. Door held by the Alderman, of all people. Velle.",
      tags: [TOWER, MAINS],
    },
    {
      number: 28,
      title: "The Broken Oath",
      beats: [
        "From the top of six hundred steps, Magister Velle came down to meet Old Wick at the door.",
        "She read the guild oath aloud, all of it, and then said she would break it.",
        "She told the Guild masters on the stair everything the watch book held, night by night, for a year.",
        "Then she took Old Wick by the arm and walked him up the stairs herself.",
        "He was slow on the stairs and quick in the chamber, and he did not look at her once until the flame was in front of him.",
        "When he did look, he said she had kept it well, and she said not well enough.",
      ],
      ledger:
        "Night of the twenty-eighth. Oath broken, in full, before witnesses. Velle.",
      tags: [TOWER, SECRET],
    },
    {
      number: 29,
      title: "Lit from Afterglow",
      beats: [
        "The old flame went out at the stroke of a midnight that never finished striking.",
        "For a moment there was no time in Candlemere at all, and the whole city held its breath without knowing why.",
        "Ned found the last afterglow of the old flame hanging in the dark, thin as a hair.",
        "He lit the new wick from it, in Hattie's glass, with his mother's hand steadying his.",
        "The new flame caught small and blue, then turned gold, then grew past the scorch marks.",
        "Tallow flew once round the cage and settled on top of it, warm at last.",
      ],
      ledger:
        "Night of the twenty-ninth. Old flame out. New flame lit from afterglow by Ned Ashby. Wick.",
      tags: [TOWER, FIRST_LIGHTING, AFTERGLOW, FLAME],
    },
    {
      number: 30,
      title: "The Hours Strike True",
      beats: [
        "At dawn the Lantern struck six, all six, and every clock in Candlemere agreed with it.",
        "People came out into the streets to listen, and some of them counted aloud.",
        "The lost hour did not come back, but the council voted everyone the morning off in its place.",
        "Crane announced that the gas mains would light the streets and the Lantern would keep the time, and called it his idea.",
        "Velle offered to stand down as Warden, and the Guild asked her to stay, and she did, on conditions.",
        "The first condition was that Old Wick's name be written back into the roll of lamplighters.",
      ],
      ledger:
        "Morning of the thirtieth. Six struck true. Every clock agrees. Velle and Wick.",
      tags: [CANDLEMERE, MINUTES, MAINS, SECRET],
    },
    {
      number: 31,
      title: "The Morning Round",
      beats: [
        "Ned was sworn into the Guild of Lamplighters in the Guild Hall, with Old Wick standing beside him.",
        "The oath had a new line in it now: every lamplighter may ask what the Lantern burns.",
        "Hattie was made the Glassworks' first maker of lantern glass and singed her eyebrows to celebrate.",
        "Maud handed Ned her lamplighter's pole for the morning round, and took the spare herself.",
        "On Ladder Lane every doorstep had a lamp, lit by hand, each one leaving its afterglow.",
        "Tallow flew off over the rooftops and came straight back.",
      ],
      ledger:
        "Morning of the thirty-first. Flame above the old scorch marks. Round lit by Ned Ashby, sworn this morning.",
      tags: [HALL, WARD, AFTERGLOW],
    },
  ],
  sentences: [
    {
      text: "The Fourth Ward was the oldest ward in Candlemere, and it had the crookedest streets and the most lamps to prove it.",
      tags: [WARD],
    },
    {
      text: "Ladder Lane was so steep that the lamps at the top were lit a full minute after the lamps at the bottom.",
      tags: [WARD],
    },
    {
      text: "Maud Ashby could climb a ladder faster than most people could climb stairs.",
      tags: [WARD, MAUD],
    },
    {
      text: "She went up two rungs at a time, pole over her shoulder, humming the same three notes she always hummed.",
      tags: [WARD],
    },
    {
      text: "At the top she tipped the lamp-glass, touched the wick, and the street below turned the colour of honey.",
      tags: [WARD],
    },
    {
      text: "Ned held the foot of the ladder with one boot, which was his job, and watched the sky, which was not.",
      tags: [WARD, NED],
    },
    {
      text: "There were one hundred and twelve lamps on the Fourth Ward round, and Ned knew every one by its temper.",
      tags: [WARD, NED],
    },
    {
      text: "The lamp outside the tannery always needed two tries, and the lamp outside the chapel never needed more than one.",
      tags: [WARD],
    },
    {
      text: "One lamp on Cinder Row leaned so far over the road that carters ducked under it out of politeness.",
      tags: [WARD],
    },
    {
      text: "The Ashby house was narrow and tall and smelled of lamp oil, soup and wet coats.",
      tags: [WARD],
    },
    {
      text: "Ladders hung on the kitchen wall where other families hung pictures.",
      tags: [WARD],
    },
    {
      text: "Each of Maud's poles had a name painted on its handle, and the oldest was called Patience for reasons nobody remembered.",
      tags: [WARD, MAUD],
    },
    {
      text: "Ned's bedroom was at the top of the house, under a roof that ticked when it rained.",
      tags: [WARD, NED],
    },
    {
      text: "From his window he could see the Lantern Tower over the chimneys, gold at the top like a candle in a fist.",
      tags: [WARD],
    },
    {
      text: "Maud trimmed wicks at the kitchen table every evening, and the trimmings went into a jar marked for kindling.",
      tags: [WARD, MAUD],
    },
    {
      text: "The kitchen clock had been wrong for years, so the family told the time by looking out of the window at the tower.",
      tags: [WARD],
    },
    {
      text: "Maud said that a lamplighter who needs a clock has already lost the round.",
      tags: [WARD, MAUD],
    },
    {
      text: "Supper in the Ashby house was whatever was in the pot, and the pot was never empty for long.",
      tags: [WARD],
    },
    {
      text: "Maud ate standing up, one eye on the window, as if the dusk might arrive early and catch her sitting.",
      tags: [WARD, MAUD],
    },
    {
      text: "Ned did his sums at the end of the table, between the soup and the spare wicks.",
      tags: [WARD, NED],
    },
    {
      text: "The neighbours set their kettles by Maud's round: when her ladder went past, it was time to put the water on.",
      tags: [WARD, MAUD],
    },
    {
      text: "The old man on the corner waved at every lamp Maud lit, as if each one had been lit especially for him.",
      tags: [WARD, MAUD],
    },
    {
      text: "Ned had a habit of walking the kerb like a tightrope, and Maud had a habit of not noticing.",
      tags: [WARD, NED, MAUD],
    },
    {
      text: "Rain in the Fourth Ward came down the gutters in such a hurry it seemed late for something.",
      tags: [WARD],
    },
    {
      text: "The wind on Ladder Lane was the kind that tried every door to see which one was open.",
      tags: [WARD],
    },
    {
      text: "A lamp that went out in the wind had to be relit, and Ned was the one who ran back to do it.",
      tags: [WARD, NED],
    },
    {
      text: "Ned had a spare pole, shorter than his mother's, that he had grown into the year before last.",
      tags: [WARD, NED],
    },
    {
      text: "He could light a lamp from the ground now, if it was a short lamp and he stood on his toes.",
      tags: [WARD],
    },
    {
      text: "Maud checked each lamp she had lit by looking back over her shoulder once, never twice.",
      tags: [WARD, MAUD],
    },
    {
      text: "When the round was done, she hung up her pole, unlaced her boots and fell asleep in the chair with her coat still on.",
      tags: [WARD],
    },
    {
      text: "Ned took the coat off her, one sleeve at a time, without waking her, which was a craft of its own.",
      tags: [WARD, NED],
    },
    {
      text: "The children of Ladder Lane followed the round at a distance, like gulls behind a fishing boat.",
      tags: [WARD],
    },
    {
      text: "On Cinder Row the baker's ovens kept the pavement warm all night, and the cats knew it.",
      tags: [WARD],
    },
    {
      text: "Mrs. Larkworthy gave the lamplighters a roll each on the dawn round, and charged everybody else double to make up for it.",
      tags: [WARD],
    },
    {
      text: "Ned's mother walked so fast that the hem of her coat was always a step behind her.",
      tags: [WARD, NED],
    },
    {
      text: "She never ran, Ned noticed, but she was never late either.",
      tags: [WARD, NED],
    },
    {
      text: "Maud's guild oath hung framed by the front door, and she touched the frame each time she went out.",
      tags: [WARD, MAUD],
    },
    {
      text: "On washing days the lines across Ladder Lane were so full that the lamps had to shine through shirts.",
      tags: [WARD],
    },
    {
      text: "A dog on Snuff Street barked at every lamp as it was lit, as though somebody had to keep the light in its place.",
      tags: [WARD],
    },
    {
      text: "The lamp outside the Ashby house was the first Maud lit and the last she looked at.",
      tags: [WARD, MAUD],
    },
    {
      text: "Ned could tell which neighbour was coming up the stairs by the creak, and which was going down by the sigh.",
      tags: [WARD, NED],
    },
    {
      text: "The Fourth Ward smelled of coal smoke in winter, of tar in summer, and of baking all the year round.",
      tags: [WARD],
    },
    {
      text: "Maud kept a tin of spare wicks in her apron pocket and a tin of mints in the other, and she never mixed them up.",
      tags: [WARD, MAUD],
    },
    {
      text: "The tin of mints was for the round, she said, and the wicks were for emergencies.",
      tags: [WARD],
    },
    {
      text: "Ned asked once what sort of emergency needed a mint, and Maud said he would know when he met one.",
      tags: [WARD, NED, MAUD],
    },
    {
      text: "The lamps of the ward came on one after another down the hill, as if they were passing a message along.",
      tags: [WARD],
    },
    {
      text: "In the mornings the lamps went out the same way, in reverse, which Ned privately thought was rather sad.",
      tags: [WARD, NED],
    },
    {
      text: "Nobody in the Fourth Ward locked their door, because nobody in the Fourth Ward owned anything worth the bother.",
      tags: [WARD],
    },
    {
      text: "The pump at the bottom of Ladder Lane squeaked a note that was nearly, but not quite, the note of the Lantern bell.",
      tags: [WARD],
    },
    {
      text: "Ned had once tried to oil the pump, and the whole street had complained that it no longer sounded right.",
      tags: [WARD, NED],
    },
    {
      text: "Maud's ladder had a rung that sang when you stood on it, and she always skipped it so as not to wake the baby next door.",
      tags: [WARD, MAUD],
    },
    {
      text: "The front step of the Ashby house had been scrubbed so often it had a dip in the middle like a saucer.",
      tags: [WARD],
    },
    {
      text: "When Ned was small he had thought every lamp in the city was lit by his mother.",
      tags: [WARD, NED],
    },
    {
      text: "He knew better now, but he still thought the Fourth Ward's lamps were the best lit.",
      tags: [WARD],
    },
    {
      text: '"You hold, I climb," Maud said, which was the whole of the lamplighters\' instruction on a windy night.',
      tags: [WARD, MAUD],
    },
    {
      text: '"Don\'t look at the lamps once they\'re lit," she told him, "look at the ones that aren\'t."',
      tags: [WARD],
    },
    {
      text: '"Mind the ladder," said Maud, which meant mind the ladder, mind your feet, and mind what you say to strangers.',
      tags: [WARD, MAUD],
    },
    {
      text: "Ned had learned to sleep through anything except the sound of his mother's ladder going out.",
      tags: [WARD, NED],
    },
    {
      text: "In the Fourth Ward people still said good evening to the lamplighter, and the lamplighter still said it back.",
      tags: [WARD],
    },
    {
      text: "The tannery chimney on the corner had been crooked for so long that a straight one would have looked like a mistake.",
      tags: [WARD],
    },
    {
      text: "The rooftops of the ward were patched with slates of every colour, like a quilt nobody had finished.",
      tags: [WARD],
    },
    {
      text: "Ned knew a way across three roofs to the end of the row, and so, it turned out, did every cat in the street.",
      tags: [WARD, NED],
    },
    {
      text: "On frosty nights the lamps of the Fourth Ward wore little haloes, like a row of saints on a church window.",
      tags: [WARD],
    },
    {
      text: "Maud's hands were always cold and always steady, and she said the second was because of the first.",
      tags: [WARD, MAUD],
    },
    {
      text: "The thick book of sermons on the mantelpiece was mostly used to press wicks flat, which Maud said was a perfectly good use for it.",
      tags: [WARD, MAUD],
    },
    {
      text: "At the end of every round Maud wrote the number of lamps lit in a little book, and the number was always the same.",
      tags: [WARD, MAUD],
    },
    {
      text: "Ned liked the sound of her pencil, scratching the same number every night, as if it were a promise kept.",
      tags: [WARD, NED],
    },
    {
      text: "The house next door had seven children, and all seven could be heard at once through the wall.",
      tags: [WARD],
    },
    {
      text: "When the youngest cried at night, Maud tapped twice on the wall, and somehow it helped.",
      tags: [WARD, MAUD],
    },
    {
      text: "The Fourth Ward's street names had been painted so long ago that most of them could only be read by touch.",
      tags: [WARD],
    },
    {
      text: "Ned could find his way home blindfold, though he had only tried it once and walked into the pump.",
      tags: [WARD, NED],
    },
    {
      text: "The windows of the ward were small and the glass was old, and every street lamp showed through them a little wavy.",
      tags: [WARD],
    },
    {
      text: "Maud said that a good lamplighter leaves every street brighter and every neighbour none the wiser.",
      tags: [WARD, MAUD],
    },
    {
      text: "In the hour before dusk the whole ward went quiet, as if it were waiting for its lamps.",
      tags: [WARD],
    },
    {
      text: "The bootmaker on the corner of Cinder Row mended Maud's boots for nothing, because she had once carried his mother home.",
      tags: [WARD, MAUD],
    },
    {
      text: "The Ashby kettle took so long to boil that Maud put it on before she went out and drank the tea when she got back.",
      tags: [WARD, MAUD],
    },
    {
      text: "On Ladder Lane even the drainpipes leaned, as though they had been listening at the windows for years.",
      tags: [WARD],
    },
    {
      text: "The lamps at the bottom of the hill were lit first, so the people walking up always had light ahead of them.",
      tags: [WARD],
    },
    {
      text: "Ned liked the moment when the last lamp was lit and the whole street seemed to let its breath out.",
      tags: [WARD, NED],
    },
    {
      text: "Maud had never missed a round in nineteen years, not for fever, not for snow, and not for the night Ned was born.",
      tags: [WARD, NED, MAUD],
    },
    {
      text: "On the night Ned was born, as the neighbours told it, she lit the last lamp of the round and then sat down rather quickly.",
      tags: [WARD, NED],
    },
    {
      text: "Ned's boots had been his mother's boots, and before that somebody else's, and they still had a lot of walking in them.",
      tags: [WARD, NED],
    },
    {
      text: "The neighbours who could not read the clock read the lamps instead, and they were seldom wrong.",
      tags: [WARD],
    },
    {
      text: "Mrs. Larkworthy said she could tell the time by the smell of her own bread, and she was right more often than the tower.",
      tags: [WARD],
    },
    {
      text: "Ned's favourite lamp was the one at the top of Ladder Lane, because from there you could see the whole city light up.",
      tags: [WARD, NED],
    },
    {
      text: "From the top of the lane, the lamps of Candlemere spread out below like crumbs of gold on a dark tablecloth.",
      tags: [WARD],
    },
    {
      text: "The Fourth Ward's lamplighters had always been Ashby women and Ashby men, as far back as anybody could remember, and further than the Guild could prove.",
      tags: [WARD],
    },
    {
      text: "Maud's mother had lit the ward before her, and had climbed ladders until she was eighty, a little more slowly each year.",
      tags: [WARD, MAUD],
    },
    {
      text: "There was a nail in the kitchen beam where Ned's grandmother's pole had hung, and Maud never hung anything else on it.",
      tags: [WARD, NED, MAUD],
    },
    {
      text: "The night Ned stopped needing a hand up the ladder, his mother made toffee, and it was the worst toffee in the ward.",
      tags: [WARD, NED],
    },
    {
      text: "The Lantern Tower stood in the middle of Candlemere, and every street in the city bent a little to keep it in view.",
      tags: [TOWER],
    },
    {
      text: "It was the tallest thing for forty miles, and at its top the flame burned behind a great round window.",
      tags: [TOWER],
    },
    {
      text: "From the street the window looked like a coin of gold that somebody had pressed into the sky.",
      tags: [TOWER],
    },
    {
      text: "The tower was built of a grey stone that turned pink at dusk and silver at dawn.",
      tags: [TOWER],
    },
    {
      text: "Pigeons lived on every ledge of it, and they were the best-informed pigeons in the city.",
      tags: [TOWER],
    },
    {
      text: "The door at the foot of the tower was oak bound with iron, and it had not been opened for a visitor in two hundred years.",
      tags: [TOWER],
    },
    {
      text: "Above the door a motto was carved so deep that rain ran out of it like a gutter: the flame is kept.",
      tags: [TOWER],
    },
    {
      text: "The bell hung under the flame chamber, and it was so large that a family of six could have had supper inside it.",
      tags: [TOWER],
    },
    {
      text: "When the bell struck, the windows of the nearest streets hummed for a full minute after.",
      tags: [TOWER],
    },
    {
      text: "Inside, the stairs went round and round, and anybody who climbed them came out a little dizzy and a little proud.",
      tags: [TOWER],
    },
    {
      text: "The steps were worn into dips by centuries of boots, so that climbing them felt like walking up a frozen waterfall.",
      tags: [TOWER],
    },
    {
      text: "Small windows let in slits of the city as the stairs wound up, each one higher and each one smaller.",
      tags: [TOWER],
    },
    {
      text: "Halfway up was a landing with a bench, where lamplighters were allowed one sit-down and no more.",
      tags: [TOWER],
    },
    {
      text: "The bench had been polished by so many tired lamplighters that it shone like a conker.",
      tags: [TOWER],
    },
    {
      text: "On the walls of the stair, the name of every Warden was cut into brass, the oldest so worn it was nearly smooth.",
      tags: [TOWER, VELLE],
    },
    {
      text: "The air in the tower was always warm, even in January, and it smelled of wax, iron and old rope.",
      tags: [TOWER],
    },
    {
      text: "Near the top, the stairs grew so narrow that two people could only pass if one of them breathed in.",
      tags: [TOWER],
    },
    {
      text: "The flame chamber was round, and every sound in it came back twice, as if the walls were checking.",
      tags: [TOWER],
    },
    {
      text: "In the middle of the chamber the Lantern stood in a cage of brass bars, each one as thick as a wrist.",
      tags: [TOWER],
    },
    {
      text: "The flame inside was taller than a man and quieter than a candle.",
      tags: [TOWER],
    },
    {
      text: "It did not flicker; it simply stood there, burning, as calmly as a person waiting for a bus that always comes.",
      tags: [TOWER],
    },
    {
      text: "Above the flame, the ceiling was black with scorch marks, ring above ring, like the rings of a tree.",
      tags: [TOWER],
    },
    {
      text: "The highest scorch mark was the oldest, and the lowest was last year's, and they were not supposed to move.",
      tags: [TOWER],
    },
    {
      text: "A brass rod hung beside the cage, marked in notches, for measuring the flame on the first night of every month.",
      tags: [TOWER],
    },
    {
      text: "Every hour, a hammer the size of a sheep lifted itself and struck the bell, and the whole tower shrugged.",
      tags: [TOWER],
    },
    {
      text: "The clockwork that drove the hammer took up a whole floor and ticked like a very large, very patient beetle.",
      tags: [TOWER],
    },
    {
      text: "The great window was polished every morning, inside and out, by a man who did nothing else.",
      tags: [TOWER],
    },
    {
      text: "He had polished the window for thirty years and claimed he could see his own face in it from the street.",
      tags: [TOWER],
    },
    {
      text: "The coal chute beside the tower door was for the stoves on the stair, not the flame, which needed no coal.",
      tags: [TOWER],
    },
    {
      text: "The coal chute had a lid that rattled in the wind, and the rattling had a rhythm, like somebody trying to remember a song.",
      tags: [TOWER],
    },
    {
      text: "Nobody could say how old the tower was, except that it was older than anybody's grandmother's grandmother.",
      tags: [TOWER],
    },
    {
      text: "On a clear night you could see the Lantern from the mudflats, and on a foggy one you could still hear it.",
      tags: [TOWER],
    },
    {
      text: "The flame chamber was so hot near the cage that Ned's eyebrows prickled.",
      tags: [TOWER, NED],
    },
    {
      text: "The cage had a door, and the door had a lock, and the lock had a key that only the Warden carried.",
      tags: [TOWER, VELLE],
    },
    {
      text: "At the top of the tower the city noise thinned out until all that was left was the wind and the clockwork.",
      tags: [TOWER],
    },
    {
      text: "Climbing the tower, Ned noticed, made the city look smaller and its problems look larger.",
      tags: [TOWER, NED],
    },
    {
      text: "Looking down from the top window, the streets of Candlemere were thin gold threads, and the people were full stops.",
      tags: [TOWER],
    },
    {
      text: "Ned's legs began to ache at the three hundredth step and stopped aching at the five hundredth, out of sheer surprise.",
      tags: [TOWER, NED],
    },
    {
      text: "Hattie took the stairs two at a time for the first hundred and one at a time for the rest.",
      tags: [TOWER, HATTIE],
    },
    {
      text: "A guard sat at the foot of the tower every night, and every night he fell asleep at about eleven.",
      tags: [TOWER],
    },
    {
      text: "His snoring could be heard halfway up the stairs, and it was more regular than the bell lately.",
      tags: [TOWER],
    },
    {
      text: "The stoves on the stair landings were lit in winter so that the lamplighters' hands would not shake.",
      tags: [TOWER],
    },
    {
      text: "Tallow liked the tower more than anywhere, and rode up the stairwell on warm air without moving its wings.",
      tags: [TOWER, TALLOW],
    },
    {
      text: "The tower's shadow moved across the city through the day like the hand of an enormous clock.",
      tags: [TOWER],
    },
    {
      text: "Children in Candlemere were told that if they could see the tower they could find their way home, and it was true.",
      tags: [TOWER],
    },
    {
      text: "The bell had a crack in its lip that nobody mentioned, the way nobody mentions a dear friend's limp.",
      tags: [TOWER],
    },
    {
      text: "When the bell rang late, the pigeons were the first to notice, and they rose all at once in complaint.",
      tags: [TOWER],
    },
    {
      text: "The flame chamber had one chair in it, and the chair had a cushion, and the cushion had seen better centuries.",
      tags: [TOWER],
    },
    {
      text: "The bars of the cage were warm to the touch and hummed very slightly, like a cat considering whether to purr.",
      tags: [TOWER],
    },
    {
      text: "At night the flame made the round window glow so evenly that it looked painted on.",
      tags: [TOWER],
    },
    {
      text: "Lamplighters who climbed the tower for their oath left a thumbprint of soot on the bottom step, and the step was black with them.",
      tags: [TOWER],
    },
    {
      text: "Ned found his grandmother's thumbprint on the bottom step, or decided that he had, which came to the same thing.",
      tags: [TOWER, NED],
    },
    {
      text: "There was a window on the stair from which you could see all six wards at once, if you did not mind leaning.",
      tags: [TOWER],
    },
    {
      text: "From that window the Fourth Ward looked like a handful of matches somebody had dropped and lit.",
      tags: [TOWER],
    },
    {
      text: "The stairs creaked going up and were silent coming down, as though they only had opinions about climbers.",
      tags: [TOWER],
    },
    {
      text: "It was said in the city that the tower had never once been late, and lately people had stopped saying it.",
      tags: [TOWER],
    },
    {
      text: "Somebody had carved a small moth into the stone of the hundredth step, and nobody knew who.",
      tags: [TOWER],
    },
    {
      text: "On the four hundredth step there was a dent where, the story went, a Warden had once dropped the key.",
      tags: [TOWER, VELLE],
    },
    {
      text: "The higher they climbed, the more the walls seemed to lean in to listen.",
      tags: [TOWER],
    },
    {
      text: "The door to the flame chamber was so heavy that it took both of them, pushing with their backs, to move it a hand's width.",
      tags: [TOWER],
    },
    {
      text: "The flame threw no shadow of its own, which Hattie said was impossible and Ned said was the point.",
      tags: [TOWER, NED, HATTIE],
    },
    {
      text: "In the flame chamber, time felt thicker, like honey in winter.",
      tags: [TOWER],
    },
    {
      text: "Ned put his palm flat to the tower's outer wall one night and felt the bell strike through the stone.",
      tags: [TOWER, NED],
    },
    {
      text: "The pigeons on the ledges shifted as the hour came, a whole tower of feathers holding its breath.",
      tags: [TOWER],
    },
    {
      text: "The tower clock had two hands and no numbers, because everybody in Candlemere was assumed to know them already.",
      tags: [TOWER],
    },
    {
      text: "Tallow sat on the lip of the great window and looked out at the city as if it owned it.",
      tags: [TOWER, TALLOW],
    },
    {
      text: "Above the bell, a little iron gallery ran round the outside of the tower, and only the brave or the foolish used it.",
      tags: [TOWER],
    },
    {
      text: "Hattie used the gallery without a second thought, and Ned used it with a great many.",
      tags: [TOWER, NED, HATTIE],
    },
    {
      text: "From the gallery the wind tried to take their caps, then their breath, then their courage, in that order.",
      tags: [TOWER],
    },
    {
      text: "At the very top the flame's warmth met the night's cold, and the meeting made a sound like a kettle just beginning.",
      tags: [TOWER],
    },
    {
      text: "The Glassworks stood by the river, a long brick shed with six chimneys that never all smoked at once.",
      tags: [GLASSWORKS],
    },
    {
      text: "Inside it was so hot that the apprentices wore their sleeves rolled and their hair tied up in rags.",
      tags: [GLASSWORKS],
    },
    {
      text: "Six furnaces glowed along the wall, each with its own bench, its own stool and its own bucket of water.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie Price worked the third furnace, which was the hottest, because she had asked for it.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "She could blow a lamp-glass in four breaths, and on a good day she could do it while telling a joke.",
      tags: [GLASSWORKS],
    },
    {
      text: "On the first breath the glass swelled, on the second it rounded, and on the third it found its shoulders.",
      tags: [GLASSWORKS],
    },
    {
      text: "The fourth breath was the one nobody could teach, and Hattie said it was mostly listening.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "She turned her blowpipe as if the molten glass on the end of it were a spoonful of honey that must not drip.",
      tags: [GLASSWORKS],
    },
    {
      text: "Her eyebrows had been singed so often that they had given up growing back evenly.",
      tags: [GLASSWORKS],
    },
    {
      text: "She kept her goggles pushed up on her forehead, where they did no good at all.",
      tags: [GLASSWORKS],
    },
    {
      text: "When she pulled them down, she left two clean circles in a face of soot, like an owl that had been up a chimney.",
      tags: [GLASSWORKS],
    },
    {
      text: "Mistress Brakewell ran the Glassworks floor, and her voice could be heard over six furnaces and a rainstorm.",
      tags: [GLASSWORKS],
    },
    {
      text: 'She called every apprentice "you there", including the ones she liked best.',
      tags: [GLASSWORKS],
    },
    {
      text: "Mistress Brakewell had a burn on each hand, one from her first day and one from the day she was made foreman.",
      tags: [GLASSWORKS],
    },
    {
      text: "She said she would get a third when she retired, so as to have a set.",
      tags: [GLASSWORKS],
    },
    {
      text: "Racks of new lamp-glasses cooled along the far wall, ticking and pinging like a roomful of small clocks.",
      tags: [GLASSWORKS],
    },
    {
      text: "A good lamp-glass rang when you tapped it with a fingernail, and a bad one only said something rude.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie could tell a good glass from a bad one by the ring, and she could tell a good day from a bad one the same way.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "The Glassworks yard was heaped with broken glass, green and brown and clear, waiting to be melted down again.",
      tags: [GLASSWORKS],
    },
    {
      text: "On sunny afternoons the heaps glittered so brightly that the gulls landed on them by mistake and left in a huff.",
      tags: [GLASSWORKS],
    },
    {
      text: "The sand for the furnaces came up the river on barges and was shovelled ashore by men who sang about it.",
      tags: [GLASSWORKS],
    },
    {
      text: "Their songs were mostly about sand, which Hattie said showed a lack of ambition.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "The bellows in the corner were worked by foot, and the apprentice on them got the best view of everything.",
      tags: [GLASSWORKS],
    },
    {
      text: "The Glassworks cat slept on the warmest brick of the third furnace, and was said to be older than the Warden.",
      tags: [GLASSWORKS, VELLE],
    },
    {
      text: "Nobody had ever seen the cat eat, and everybody agreed it lived on heat.",
      tags: [GLASSWORKS],
    },
    {
      text: "At noon the furnaces were banked, the apprentices ate their bread on the river wall, and the whole shed sighed.",
      tags: [GLASSWORKS],
    },
    {
      text: "The river beside the Glassworks ran warm for a hundred yards downstream, and the ducks there were very fat.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie had a jar on her bench full of glass beads that had gone wrong in interesting ways.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "She said a glass that goes wrong teaches you more than a glass that goes right, but not as quickly.",
      tags: [GLASSWORKS],
    },
    {
      text: "Ned was not allowed near the furnaces, which was the rule for visitors, and he kept to it about half the time.",
      tags: [GLASSWORKS, NED],
    },
    {
      text: "He liked to sit on an upturned crate by the door and watch the glass breathe in and out on the end of Hattie's pipe.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "Every lamp-glass in Candlemere had been blown in this shed, and every one had the Guild's stamp on its base.",
      tags: [GLASSWORKS],
    },
    {
      text: "The stamps hung on hooks by the door, iron and black, each one shaped like a tiny tower.",
      tags: [GLASSWORKS],
    },
    {
      text: "The old moulds were stacked at the back of the shed, under dust so thick it had footprints in it.",
      tags: [GLASSWORKS],
    },
    {
      text: "Some of the moulds were older than the shed itself, and nobody remembered what half of them were for.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie said the Glassworks was the only place in the city where things got made instead of merely kept.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "Mistress Brakewell bellowed the hour across the floor, and every apprentice glanced at the window to check it against the tower.",
      tags: [GLASSWORKS],
    },
    {
      text: "Lately the bellow and the tower had begun to disagree, and Mistress Brakewell was not a woman who liked to be disagreed with.",
      tags: [GLASSWORKS],
    },
    {
      text: "When a glass cracked in the cooling, it made a sound like a small sad bird, and everyone looked up.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie never threw a cracked glass away; she put it back on the heap and told it better luck next time.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "Molten glass glowed so bright it left a picture in your eyes after you looked away.",
      tags: [GLASSWORKS],
    },
    {
      text: "Ned saw the afterglow of the furnaces long after the apprentices had gone home, hanging over the benches like warm breath.",
      tags: [GLASSWORKS, AFTERGLOW, NED],
    },
    {
      text: "Hattie had once tried to blow a glass the shape of a pear and had made something more like a cross duck.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "The duck sat on the windowsill above her bench, and she said it kept her humble.",
      tags: [GLASSWORKS],
    },
    {
      text: "The Glassworks floor was gritty with sand, so that every footstep crunched like walking on sugar.",
      tags: [GLASSWORKS],
    },
    {
      text: "On cold mornings the apprentices queued at the furnace doors to warm their hands, like people at a baker's.",
      tags: [GLASSWORKS],
    },
    {
      text: "The new lamp-glasses went out to the wards in crates packed with straw, a dozen to a crate and a curse for every one broken.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie could tell which lamplighter would break a glass first by how they carried the crate.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "Her own mother had blown glass at the same furnace, and her grandfather before that, and both of them had singed eyebrows too.",
      tags: [GLASSWORKS],
    },
    {
      text: "The Glassworks had a book where every glass made was written down, and every glass broken was written in red.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie's page had more red on it than anybody's, and more black too, because she made more than anybody.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "At closing time the furnaces were banked under ash, and the shed ticked and settled like an old dog lying down.",
      tags: [GLASSWORKS],
    },
    {
      text: "The foreman's whistle at the end of the day was so shrill that it set every new glass on the racks ringing.",
      tags: [GLASSWORKS],
    },
    {
      text: "The apprentices learned the furnace doors by their colours: cherry, orange, straw and white, which meant stand back.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie said white heat looked like a held breath, and Ned thought about that for a long time.",
      tags: [GLASSWORKS, NED, HATTIE],
    },
    {
      text: "A glass blown too thin went soft at the edges and sagged like a tired face.",
      tags: [GLASSWORKS],
    },
    {
      text: "A glass blown too thick was strong and dull and never rang, like a person who has stopped listening.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie sang under her breath while she worked, always the same tune, and always slightly out of time with the furnace.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "The smoke from the Glassworks chimneys smelled of hot sand and burnt toast, which Hattie said was mostly the toast.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "Hattie kept a crust of bread on her furnace door to toast, and it was the best toast in Candlemere.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "The windows of the Glassworks were the dirtiest in the city, which Hattie said was what came of making glass and not looking through it.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "Ned loved the moment when a gather of glass came out of the furnace, glowing, like a small sun on a stick.",
      tags: [GLASSWORKS, NED],
    },
    {
      text: "Hattie's hands moved faster than she talked, and she talked very fast.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "When Mistress Brakewell was pleased with a glass, she held it up to the window and said nothing for a long time.",
      tags: [GLASSWORKS],
    },
    {
      text: "When she was not pleased, she said a great deal, all of it useful.",
      tags: [GLASSWORKS],
    },
    {
      text: "The pipes hung in a rack by the furnace, long and thin, each one scorched at one end and polished by hands at the other.",
      tags: [GLASSWORKS],
    },
    {
      text: "Hattie's blowpipe had her initials scratched into it and her teeth marks too, from the year she had first learned.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "On the river wall outside, Ned and Hattie sat with their legs dangling and the Lantern Tower straight ahead across the water.",
      tags: [GLASSWORKS, NED, HATTIE],
    },
    {
      text: "From the Glassworks yard you could see the flame in the tower window, and Hattie said she checked on it every morning, like a neighbour.",
      tags: [GLASSWORKS, HATTIE],
    },
    {
      text: "The Glassworks never stopped for the bell, and Mistress Brakewell said the glass did not care what time it was.",
      tags: [GLASSWORKS],
    },
    {
      text: "Lamp-glass came out of the cooling racks smoky and was polished with newspaper until it was clear as a held breath of winter.",
      tags: [GLASSWORKS],
    },
    {
      text: "The Guild Hall stood on the square opposite the tower, and it had been built to look as if it were keeping an eye on it.",
      tags: [HALL],
    },
    {
      text: "Its front was all columns, and each column had a carved lamp at the top that had never once been lit.",
      tags: [HALL],
    },
    {
      text: "Inside, the hall was long and cold and full of benches, with a gallery above for people who were not sworn.",
      tags: [HALL],
    },
    {
      text: "Three hundred lamplighters could sit in the Guild Hall at once, and on quarter night they did.",
      tags: [HALL],
    },
    {
      text: "On quarter night the hall smelled of lamp oil, wet wool and three hundred people who had walked a long way.",
      tags: [HALL],
    },
    {
      text: "A portrait of every Warden hung along the walls, each one painted holding a lamp and looking slightly worried.",
      tags: [HALL, VELLE],
    },
    {
      text: "The newest portrait was of Magister Velle, and the painter had given her more patience than she had.",
      tags: [HALL, VELLE],
    },
    {
      text: "At the far end of the hall stood the old brass lamp, on which every lamplighter swore the guild oath.",
      tags: [HALL],
    },
    {
      text: "The brass lamp had been touched so many times that the top was worn bright and the base was green.",
      tags: [HALL],
    },
    {
      text: "The guild oath was eleven lines long, and every lamplighter could say it in their sleep, and some did.",
      tags: [HALL],
    },
    {
      text: "The oath ended with the words keep the flame and ask nothing, and Ned had always thought that a strange thing to promise.",
      tags: [HALL, NED],
    },
    {
      text: "The Guild masters sat on a raised bench at the front, in black robes with a lamp sewn in gold on each sleeve.",
      tags: [HALL],
    },
    {
      text: "The masters were all very old, and they all agreed with each other, which saved a great deal of time.",
      tags: [HALL],
    },
    {
      text: "The Guild Hall library was down a corridor so cold that the books were said to keep better there.",
      tags: [HALL],
    },
    {
      text: "The library held the roll of every lamplighter ever sworn, in books so heavy they had to be opened on the floor.",
      tags: [HALL],
    },
    {
      text: "The librarian was a small man in two cardigans who had read every book in the place and agreed with none of them.",
      tags: [HALL],
    },
    {
      text: "He had worked in the library so long that the dust had learned to step round him.",
      tags: [HALL],
    },
    {
      text: "In the cloakroom of the Guild Hall hung a hundred lamplighters' coats, and every one of them was damp.",
      tags: [HALL],
    },
    {
      text: "The Warden's study was up a spiral stair at the back of the hall, behind a door with no handle on the outside.",
      tags: [HALL, VELLE],
    },
    {
      text: "The study was full of clocks, all ticking, and none of them agreed about anything.",
      tags: [HALL],
    },
    {
      text: "Magister Velle said she kept them to remind herself that time is a matter of opinion everywhere but the tower.",
      tags: [HALL, VELLE],
    },
    {
      text: "Her desk was covered in papers, and the papers were covered in numbers, and the numbers were all getting smaller.",
      tags: [HALL],
    },
    {
      text: "On the windowsill of the study stood a row of old lamp-glasses, each one a different shape, like a family photograph.",
      tags: [HALL],
    },
    {
      text: "A fire burned in the study grate, small and tidy, the way Magister Velle liked everything.",
      tags: [HALL, VELLE],
    },
    {
      text: "Velle wrote with a steel pen that scratched so loudly it sounded like somebody disagreeing.",
      tags: [HALL, VELLE],
    },
    {
      text: "The Guild had rules for everything, including how many rules it was allowed to have.",
      tags: [HALL],
    },
    {
      text: "Rule nine said that a lamplighter must never let a lamp go out on purpose, and rule ten said what to do when they did.",
      tags: [HALL],
    },
    {
      text: "The Guild's seal was a lantern inside a circle, and it was stamped on every lamp-glass, every pole and every apology.",
      tags: [HALL],
    },
    {
      text: "At the back of the hall was a board where the names of lamplighters who had died on the round were painted in gold.",
      tags: [HALL],
    },
    {
      text: "There were not many names on the board, and every one of them had a candle under it on quarter night.",
      tags: [HALL],
    },
    {
      text: "Maud's father's name was on the board, near the bottom, and she always sat at the back, beneath it.",
      tags: [HALL, MAUD],
    },
    {
      text: "The masters' bench had a bell on it, and when the bell was rung, everyone stopped talking at once.",
      tags: [HALL],
    },
    {
      text: "When the bell was rung twice, everybody stood, and when it was rung three times, nobody could remember what happened.",
      tags: [HALL],
    },
    {
      text: "The gallery above the hall was the best place to hear what was going on, and the worst place to be seen.",
      tags: [HALL],
    },
    {
      text: "Ned and Hattie had found that if they lay flat on the gallery floor, they could see the whole hall through a crack.",
      tags: [HALL, NED, HATTIE],
    },
    {
      text: "The crack in the gallery floor had been there so long that generations of lamplighters' children had looked through it.",
      tags: [HALL],
    },
    {
      text: "The Guild Hall echoed so well that a whisper at one end arrived at the other a second later, slightly louder.",
      tags: [HALL],
    },
    {
      text: "Magister Velle never raised her voice in the hall, because she had never needed to.",
      tags: [HALL, VELLE],
    },
    {
      text: "When she stood up, the benches went quiet in a ripple from front to back, like wind through a field.",
      tags: [HALL],
    },
    {
      text: "The masters of the Guild called her Warden, and the lamplighters called her the Magister, and Maud called her Cora.",
      tags: [HALL, VELLE, MAUD],
    },
    {
      text: "The Guild Hall clock had stopped in the year the library roof leaked, and nobody had dared to start it again.",
      tags: [HALL],
    },
    {
      text: "The guild oath had a line about keeping the flame, a line about keeping the peace, and a line about keeping quiet.",
      tags: [HALL],
    },
    {
      text: "Ned noticed that the line about keeping quiet was the only one the masters said loudly.",
      tags: [HALL, NED],
    },
    {
      text: "The roll of lamplighters had one page missing, cut out so neatly that the binding had healed over it like skin.",
      tags: [HALL],
    },
    {
      text: "Every new apprentice was taken to see the brass lamp before they were sworn, and every one of them was told not to touch it yet.",
      tags: [HALL],
    },
    {
      text: "The Guild Hall's front steps were so wide that a whole procession could stand on them, and once a year one did.",
      tags: [HALL],
    },
    {
      text: "On the day of the procession, every lamplighter in the city carried their pole and walked twice round the tower.",
      tags: [HALL],
    },
    {
      text: "The masters walked at the front, then the lamplighters by ward, then the apprentices, then a great many dogs.",
      tags: [HALL],
    },
    {
      text: "Velle's robes were older than the robes of anybody else in the hall, because she had inherited them and never replaced them.",
      tags: [HALL, VELLE],
    },
    {
      text: "She had sewn a patch on one elbow herself, badly, and was secretly proud of it.",
      tags: [HALL],
    },
    {
      text: "The study had one comfortable chair, which was for visitors, and one uncomfortable one, which was hers.",
      tags: [HALL],
    },
    {
      text: "Velle offered visitors tea from a pot so old that the spout had worn into a sort of sigh.",
      tags: [HALL, VELLE],
    },
    {
      text: "The Guild kept a book of complaints, and the book of complaints was the thickest book in the library.",
      tags: [HALL],
    },
    {
      text: "Most of the complaints were about lamps lit too early, lamps lit too late, and the price of oil.",
      tags: [HALL],
    },
    {
      text: "Lamplighters were sworn at twelve, as their grandparents had been, with a pole across their palms and their family behind them.",
      tags: [HALL],
    },
    {
      text: "Ned had expected to be sworn at twelve too, and had been practising the oath in front of the kitchen kettle for a year.",
      tags: [HALL, NED],
    },
    {
      text: '"The Guild does not hurry," Velle said, "and it does not apologise, and lately I wish it did both."',
      tags: [HALL, VELLE],
    },
    {
      text: '"Sit," Velle said, which in her study meant sit, listen, and do not touch the clocks.',
      tags: [HALL, VELLE],
    },
    {
      text: '"Every Warden inherits a cupboard," Velle said, "and every cupboard has something in it nobody wants to look at."',
      tags: [HALL, VELLE],
    },
    {
      text: "The masters' robes rustled when they disagreed, and on quarter night the hall sounded like a forest in a gale.",
      tags: [HALL],
    },
    {
      text: "Old Wick's lighthouse stood at the far edge of the mudflats, where the land gave up and the sea had not quite started.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "Nobody in Candlemere admitted the lighthouse was there, and everybody in Candlemere knew exactly where it was.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "It was built of salvage, and every piece of it had been something else first.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The walls were ship's timbers, the stairs were a staircase from a demolished bank, and the front door was painted blue on one side only.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "There were a hundred windows, and no two of them matched, and several of them had once been in a church.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "One window was the bottom of a green bottle, set into the wall, and it made the stairs look as if they were under the sea.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The roof was made of tin sheets, and in the rain it sounded like a crowd applauding something it did not understand.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "At the top of the lighthouse burned a lamp no bigger than a teapot, and it threw its light for miles.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Its light was small and steady and gold, and it never flickered once, even in a gale.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Old Wick was well over ninety and climbed his own stairs faster than either of his visitors.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "He had a beard so long that he tucked it into his belt, so that it would not catch fire or blow into the soup.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "His eyes were pale and very bright, like the inside of a shell held up to the light.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "He wore three coats at once, all of them Guild coats, with the lamps on the sleeves picked out with a knife.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Old Wick kept goats, chickens and an opinion about everything, and the goats were the easiest to get on with.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "The goats lived on the ground floor and the chickens on the first, and Old Wick said they kept each other honest.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "His kitchen was on the second floor, with a stove made from a ship's boiler and a kettle that whistled two notes.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Old Wick set his visitors to work before he let them talk, because talk, he said, was what you did with your hands busy.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "There were wicks to trim, glasses to clean, chickens to feed and a great many opinions to listen to.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Old Wick trimmed a wick with one snip, and the wick looked grateful.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "He lit his lamp every evening with a pole he had made himself, out of an oar and a spoon.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The lighthouse was full of lamps, on every shelf and step, and only some of them were lit.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Each lamp had a label in Old Wick's spidery hand, giving where it had come from and when it had last been lit.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "He had rescued every lamp in the place from the city's rubbish, one barrow at a time, over sixty years.",
      tags: [LIGHTHOUSE],
    },
    {
      text: '"A lamp is never finished," Old Wick said, "only resting between lightings."',
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: '"People ask what a thing does," said Old Wick, "and never what it eats."',
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: '"Sit down, eat something, and do not tell me anything until you have," said Old Wick.',
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "Old Wick laughed rarely, and when he did it sounded like a gate that had not been opened for some time.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "His bed was a hammock slung between two beams, and he said it had cured him of falling out of beds.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The mudflats around the lighthouse hissed and popped at low tide, as though they were cooking something.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "At high tide the water came right up to the front door, and Old Wick went in and out by the window.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "On still evenings the whole lighthouse smelled of salt, smoke and something baking, which was usually bread and occasionally the goat.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The top of the lighthouse had a gallery made from a bandstand railing, painted white and peeling like a sunburnt nose.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "From the gallery you could see the whole of Candlemere across the mudflats, small and gold and very far away.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The Lantern Tower looked, from out here, like a single matchstick standing up in a saucer of crumbs.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Old Wick watched the tower from his gallery every night, and he knew its flame better than the Guild did.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "He had painted a line on his gallery rail for every night the Lantern rang late, and the lines went right round.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "His lamp at the top burned on afterglow too, gathered from all the lamps in the house, and he had never told a soul.",
      tags: [LIGHTHOUSE, AFTERGLOW],
    },
    {
      text: "Ned saw the afterglow drifting up the lighthouse stairs like mist rising off a pond in the morning.",
      tags: [LIGHTHOUSE, AFTERGLOW, NED],
    },
    {
      text: "Old Wick's books were stacked on the stairs, one book per step, so that climbing up was a kind of reading.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "Most of his books were about light, and the rest were about goats, and some were about both.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "He had written notes in the margins of every book, and many of the notes said no, that is not it.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The lighthouse shook a little in a strong wind, like an old dog shaking off the rain.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Old Wick said it had been shaking for sixty years and had not fallen down yet, out of stubbornness.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "The chickens laid their eggs in old lamp-glasses, and Old Wick said they were the best eggs on the coast.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "There was a hole in the roof where the rain came in, and under it stood a bucket, and in the bucket grew watercress.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "Old Wick had a cat too, but the cat lived on the roof and only came down to look disappointed.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "His supper was always soup, and the soup was always different, and he never said what was in it.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "After supper Old Wick sat by the stove with his feet in the oven, which he said was what ovens were for.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "The kettle on Old Wick's stove had been mended so often that most of it was mend.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "On the lighthouse door, at the height of a child's eye, Old Wick had painted a small moth.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "When Tallow saw the painted moth, it landed beside it and stayed there for an hour, quite still.",
      tags: [LIGHTHOUSE, TALLOW],
    },
    {
      text: "Old Wick spoke to his lamps as he lit them, quietly, like a man greeting a friend in a library.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "He knew every lamp in the lighthouse by its flame, and could tell from the next room which one wanted trimming.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The mud round the lighthouse had swallowed a cart, two boots and a piano, and Old Wick said it was still hungry.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "On foggy nights Old Wick rang a handbell from the gallery, so that anyone lost on the mudflats could find their way.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "Nobody had been lost on the mudflats for years, but he rang the bell anyway, because you never knew.",
      tags: [LIGHTHOUSE],
    },
    {
      text: "The lighthouse had a front step, though it stood in mud, because Old Wick said a house without a step was not a house.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "At dawn the light at the top went pale and then went out, and Old Wick always said good morning to it.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: '"Light it like you mean it," said Old Wick, "or do not light it at all."',
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: '"I was thrown out for asking a question," Old Wick said, "and I have been asking it ever since, out here, where nobody minds."',
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "Old Wick's hands were spotted and knotted and burned in a dozen places, and they never once shook near a flame.",
      tags: [LIGHTHOUSE, WICK],
    },
    {
      text: "Candlemere was a city of six wards, nine bridges and eleven thousand lamps, and it was very proud of the lamps.",
      tags: [CANDLEMERE],
    },
    {
      text: "It sat on the edge of a wide grey mere, with the mudflats on one side and the hills on the other.",
      tags: [CANDLEMERE],
    },
    {
      text: "From the hills, at dusk, Candlemere looked like a bowl of embers that somebody was keeping warm for later.",
      tags: [CANDLEMERE],
    },
    {
      text: "Every street in the city could see the tower, because the city's founders had made it a law and the builders had made it a habit.",
      tags: [CANDLEMERE],
    },
    {
      text: "The people of Candlemere told the time by the Lantern, and nothing else, and had done for six hundred years.",
      tags: [CANDLEMERE],
    },
    {
      text: "Shops opened at the bell, workshops began at the bell, and quarrels were supposed to end at it.",
      tags: [CANDLEMERE],
    },
    {
      text: "When the bell struck midnight, every baker in the city put the first loaves in, all at once, and the whole city smelled of bread.",
      tags: [CANDLEMERE],
    },
    {
      text: "The river ran through the middle of Candlemere under nine bridges, each one with a lamp at each end.",
      tags: [CANDLEMERE],
    },
    {
      text: "The oldest bridge was so narrow that two carts could not pass, and the carters had to decide who was more important.",
      tags: [CANDLEMERE],
    },
    {
      text: "The market square sat at the foot of the tower, and the market was held in its shadow, which moved through the day.",
      tags: [CANDLEMERE],
    },
    {
      text: "Traders knew the hour by which stall the tower's shadow had reached, and the cheese stall was always noon.",
      tags: [CANDLEMERE],
    },
    {
      text: "The council met in a hall on the square, in a chamber with a ceiling painted with every lamp in the city.",
      tags: [CANDLEMERE],
    },
    {
      text: "The councillors were not lamplighters, and they had a great many opinions about lamps.",
      tags: [CANDLEMERE],
    },
    {
      text: "Candlemere's chimneys were so many and so close together that from the tower they looked like a field of black wheat.",
      tags: [CANDLEMERE],
    },
    {
      text: "On foggy nights the lamps made little rooms of gold in the fog, and people walked from one to the next.",
      tags: [CANDLEMERE],
    },
    {
      text: "In the rain, every street in Candlemere shone, and the lamps shone twice, once up and once down.",
      tags: [CANDLEMERE],
    },
    {
      text: "The carters of Candlemere drove by the lamps, and if a lamp was out, they slowed down and swore.",
      tags: [CANDLEMERE],
    },
    {
      text: "There were six wards, and every ward thought itself the best, and the Fourth Ward was right.",
      tags: [CANDLEMERE],
    },
    {
      text: "The First Ward was all grand houses and gravel drives, and its lamps were polished every Sunday by footmen.",
      tags: [CANDLEMERE],
    },
    {
      text: "The Second Ward was all warehouses and wharves, and its lamps were lit by a lamplighter nobody had ever seen.",
      tags: [CANDLEMERE],
    },
    {
      text: "The newest lamps were in the First Ward, and they were lit from a single tap at the end of the road.",
      tags: [CANDLEMERE],
    },
    {
      text: "People who lived near the gas lamps said they were very bright and very even, and then they said nothing much else.",
      tags: [CANDLEMERE, MAINS],
    },
    {
      text: "In the gas streets, Ned noticed, nobody said good evening to anybody, because there was nobody to say it to.",
      tags: [CANDLEMERE, MAINS, NED],
    },
    {
      text: "The city's chimney sweeps worked by day and slept by evening, and they knew every rooftop like a pocket.",
      tags: [CANDLEMERE],
    },
    {
      text: "The sweeps used the tower as their clock, their compass and their landmark, and they were the first to say it was wrong.",
      tags: [CANDLEMERE],
    },
    {
      text: "Down by the docks the fishermen came in by the tower, steering for the flame across the mere.",
      tags: [CANDLEMERE],
    },
    {
      text: "Children in Candlemere were given a lamp of their own on their tenth birthday, small enough to hold in two hands.",
      tags: [CANDLEMERE],
    },
    {
      text: "Ned's own lamp was dented on one side from the time he had tried to use it as a drum.",
      tags: [CANDLEMERE, NED],
    },
    {
      text: "In the poorer streets, the lamps were older and dimmer and better loved.",
      tags: [CANDLEMERE],
    },
    {
      text: "Candlemere's pigeons were famously rude, and its gulls were worse, and its sparrows were the only polite birds in it.",
      tags: [CANDLEMERE],
    },
    {
      text: "Every spring the city held a Night of Lamps, when every window was lit and the bell was rung once for every ward.",
      tags: [CANDLEMERE],
    },
    {
      text: "On the Night of Lamps nobody went to bed, and the next day nobody did anything useful at all.",
      tags: [CANDLEMERE],
    },
    {
      text: "The cobbles of Candlemere were so old that they had worn into a gentle roll, like the backs of sleeping animals.",
      tags: [CANDLEMERE],
    },
    {
      text: "The carriages of Candlemere rattled so loudly on the cobbles that conversations stopped as they went by and started again after.",
      tags: [CANDLEMERE],
    },
    {
      text: "On market days the square was so full of noise that the bell had to strike twice to be heard.",
      tags: [CANDLEMERE],
    },
    {
      text: "The city's clockmakers worked on Snuff Street, where every window was full of clocks and every clock was set to the tower.",
      tags: [CANDLEMERE],
    },
    {
      text: "Lately the clockmakers had begun to set their clocks to each other instead, which led to a great deal of argument.",
      tags: [CANDLEMERE],
    },
    {
      text: "The people of Candlemere had a saying for being late: you must have been counting the strokes.",
      tags: [CANDLEMERE],
    },
    {
      text: "They had a saying for being early, too, but nobody had needed it in years.",
      tags: [CANDLEMERE],
    },
    {
      text: "Candlemere's newspapers came out at the bell, and lately they had come out at strange hours, with strange headlines.",
      tags: [CANDLEMERE],
    },
    {
      text: "One morning's headline read Where Has The Time Gone, and nobody could tell whether it was a joke.",
      tags: [CANDLEMERE],
    },
    {
      text: "The trams of Candlemere were pulled by patient brown horses who stopped at every lamp to consider it.",
      tags: [CANDLEMERE],
    },
    {
      text: "The tram drivers set their timetables by the bell, and when the bell went wrong, the trams went wrong with it.",
      tags: [CANDLEMERE],
    },
    {
      text: "On the bridges, people stopped to lean on the railings and watch the lamps doubling in the river.",
      tags: [CANDLEMERE],
    },
    {
      text: "In winter the mere froze at the edges, and the lamps along the shore lit the ice from underneath like glass.",
      tags: [CANDLEMERE],
    },
    {
      text: "In summer the city's lamps were lit late and put out early, and the lamplighters slept in the afternoons.",
      tags: [CANDLEMERE],
    },
    {
      text: "The councillors of Candlemere were elected every four years, and every four years they promised more lamps.",
      tags: [CANDLEMERE],
    },
    {
      text: "The city's founders had built the tower first, then the Guild Hall, then the market, and the houses after, wherever they fitted.",
      tags: [CANDLEMERE],
    },
    {
      text: "Candlemere's streets had been laid out by somebody who had never walked anywhere in a straight line in their life.",
      tags: [CANDLEMERE],
    },
    {
      text: "Visitors to the city got lost within the hour, and the people of Candlemere directed them kindly, by the tower.",
      tags: [CANDLEMERE],
    },
    {
      text: "At the end of every street, if you looked up, the tower was there, and that was how the city stayed in one piece.",
      tags: [CANDLEMERE],
    },
    {
      text: "In the north of the city the hills began, and on the hills stood the windmills that ground the bakers' flour.",
      tags: [CANDLEMERE],
    },
    {
      text: "The windmills turned by day and rested by night, and the millers kept the hours as faithfully as the Guild.",
      tags: [CANDLEMERE],
    },
    {
      text: "When the hours began to go wrong, the millers were the first to grind at night, and the flour came out grumpy.",
      tags: [CANDLEMERE],
    },
    {
      text: "The people of Candlemere were not easily frightened, but they were easily annoyed, and the missing minutes annoyed them.",
      tags: [CANDLEMERE],
    },
    {
      text: "In the alleys behind the market, the lamps hung so low that tall people walked with their heads on one side.",
      tags: [CANDLEMERE],
    },
    {
      text: "The city's printers set the timetable for the Guild rounds every quarter, and nobody ever read it except the lamplighters.",
      tags: [CANDLEMERE],
    },
    {
      text: "Candlemere had a museum of lamps, open every Thursday afternoon, and on Thursday afternoons nobody visited it.",
      tags: [CANDLEMERE],
    },
    {
      text: "The museum's curator dusted every lamp in the collection once a week, and talked to the oldest one about the weather.",
      tags: [CANDLEMERE],
    },
    {
      text: "The city had a fountain in the square that had never worked, and so had become the city's favourite meeting place.",
      tags: [CANDLEMERE],
    },
    {
      text: "Children threw buttons into the dry fountain for luck, because coins were too precious and buttons would do.",
      tags: [CANDLEMERE],
    },
    {
      text: "On the far side of the river were the tanneries, which smelled, and the glassworks, which smelled better.",
      tags: [CANDLEMERE],
    },
    {
      text: "The bells of the small chapels around the city all took their time from the tower, a beat late, like a choir following.",
      tags: [CANDLEMERE],
    },
    {
      text: "When the tower struck, the chapel bells answered one by one across the city, like dogs passing on a rumour.",
      tags: [CANDLEMERE],
    },
    {
      text: "The people of Candlemere took their tea at the four o'clock bell, and nothing on earth would make them take it earlier.",
      tags: [CANDLEMERE],
    },
    {
      text: "At four o'clock every kettle in the city boiled at once, and the steam from the chimneys rose like a sigh.",
      tags: [CANDLEMERE],
    },
    {
      text: "The city's cats knew every warm doorstep in Candlemere and slept on each in turn, in strict rotation.",
      tags: [CANDLEMERE],
    },
    {
      text: "On the first frost of winter, the lamplighters lit every lamp an hour early, so the city would not feel the dark.",
      tags: [CANDLEMERE],
    },
    {
      text: "The people of Candlemere loved their lamps the way people love the weather, by complaining about them constantly.",
      tags: [CANDLEMERE],
    },
    {
      text: "In the evening rush the city's bridges were so crowded that people crossed them by shuffling, like a slow dance.",
      tags: [CANDLEMERE],
    },
    {
      text: "The dockside lamps were the brightest in Candlemere, because the fishermen paid extra to have them kept.",
      tags: [CANDLEMERE],
    },
    {
      text: "A city that keeps its time by one flame, Ned thought, is a city that has put all its eggs in one very hot basket.",
      tags: [CANDLEMERE, NED],
    },
    {
      text: "The city's hours had always been the same length, as reliable as the floor, and nobody had thought about them until now.",
      tags: [CANDLEMERE],
    },
    {
      text: "When people in Candlemere were puzzled, they looked up at the tower, and lately they had looked up a great deal.",
      tags: [CANDLEMERE],
    },
    {
      text: "On the rooftops of Candlemere, by night, there was a whole second city of cats, chimneys and lost washing.",
      tags: [CANDLEMERE],
    },
    {
      text: "Ned had walked every bridge in Candlemere, and he had a favourite, the one with the crooked lamp, which leaned out over the water.",
      tags: [CANDLEMERE, NED],
    },
    {
      text: "The crooked lamp's afterglow fell on the river and stayed there, gold and wavering, long after the lamp was out.",
      tags: [CANDLEMERE, AFTERGLOW],
    },
    {
      text: "The newspaper sellers on the bridges shouted the headlines so loudly that pigeons left the parapets in protest.",
      tags: [CANDLEMERE],
    },
    {
      text: "Every year Candlemere grew a little, and every year a few more lamps were needed, and the Guild was a little more tired.",
      tags: [CANDLEMERE],
    },
    {
      text: "The children of Candlemere skipped to rhymes about the tower, and the rhymes counted the strokes.",
      tags: [CANDLEMERE],
    },
    {
      text: "Lately the rhymes had gone wrong too, because the strokes had stopped coming where the rhymes expected them.",
      tags: [CANDLEMERE],
    },
    {
      text: "The great mere beside Candlemere was so still on calm nights that the whole city seemed to stand on its own reflection.",
      tags: [CANDLEMERE],
    },
    {
      text: "Fishing boats moored along the mere wall rocked against each other and creaked like a row of old men settling into chairs.",
      tags: [CANDLEMERE],
    },
    {
      text: "In the old quarter the houses leaned towards each other over the street until their gutters nearly touched.",
      tags: [CANDLEMERE],
    },
    {
      text: "A cat could cross the old quarter from one end to the other without touching the ground, and several did so every night.",
      tags: [CANDLEMERE],
    },
    {
      text: "Candlemere had a smell of its own, of coal, river, hot bread and lamp oil, and people who left it missed the smell first.",
      tags: [CANDLEMERE],
    },
    {
      text: "On market mornings the square was so loud with geese, carts and arguments that the bell could hardly make itself heard.",
      tags: [CANDLEMERE],
    },
    {
      text: "Lamp oil came to the city by barge in great barrels stamped with the Guild's seal, and the barrels were counted twice.",
      tags: [CANDLEMERE],
    },
    {
      text: "When a lamp went out, Ned could still see where its light had been, a pale gold smudge hanging in the air.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "The afterglow faded slowly, over hours or days, like the warmth going out of a chair somebody has left.",
      tags: [AFTERGLOW],
    },
    {
      text: "Ned had seen afterglow all his life and had been told all his life not to mention it.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "To Ned, an afterglow looked the way a remembered tune sounds: thinner than the real thing, and somehow more yours.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "The afterglow of a candle was small and quick to fade, and the afterglow of an old street lamp could last a week.",
      tags: [AFTERGLOW],
    },
    {
      text: "When he passed his hand through an afterglow, it parted like steam and closed again behind his fingers.",
      tags: [AFTERGLOW],
    },
    {
      text: "Nobody else in the street ever seemed to see the afterglow, and Ned had learned to stop pointing.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "He had once asked his mother whether she could see it, and she had changed the subject so fast it nearly fell over.",
      tags: [AFTERGLOW],
    },
    {
      text: "Afterglow gathered in corners and under eaves, like gold dust in the seams of a coat.",
      tags: [AFTERGLOW],
    },
    {
      text: "On nights when every lamp was lit, the afterglow over the city rose like a slow, warm tide.",
      tags: [AFTERGLOW],
    },
    {
      text: "A lamp lit by hand left more afterglow than a lamp lit any other way, as if it remembered the hand.",
      tags: [AFTERGLOW],
    },
    {
      text: "Ned could tell how long ago a lamp had gone out by how thin its afterglow had grown, as a baker can tell bread by its crust.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "Tallow loved the afterglow, and flew through it with its wings spread, like a child running through the spray of a fountain.",
      tags: [AFTERGLOW, TALLOW],
    },
    {
      text: "Ned sometimes thought the afterglow was a sort of thank you, left behind by every lamp that had done its job.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "In the afterglow of an old lamp, Ned could sometimes make out the shape of the hand that had last lit it.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "There was afterglow on his mother's pole, thick as paint, from nineteen years of rounds.",
      tags: [AFTERGLOW],
    },
    {
      text: "The afterglow of the Fourth Ward's lamps always drifted the same way, upward and towards the tower, as if it had somewhere to be.",
      tags: [AFTERGLOW],
    },
    {
      text: "Ned had never wondered where the afterglow went, until one night he followed it with his eyes all the way up.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "Afterglow did not mind rain, wind or fog, but it disliked being ignored, and it faded fastest in the gas streets.",
      tags: [AFTERGLOW, MAINS],
    },
    {
      text: "A gas lamp left no afterglow at all, only a hard, bright nothing once it was turned off.",
      tags: [AFTERGLOW, MAINS],
    },
    {
      text: "Ned had learned to walk through afterglow without flinching, the way other children learned not to step on cracks.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "In the dark, Ned's eyes found the afterglow before anything else, the way a tongue finds a missing tooth.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "Seeing the afterglow had never helped Ned with anything, until it began to help him with everything.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "Some afterglow was warm gold, some was the pale yellow of old butter, and the oldest was almost silver.",
      tags: [AFTERGLOW],
    },
    {
      text: "Ned held a lamp-glass up to an afterglow once, and the glass filled with it like a cup under a tap.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "He knew the afterglow was not imagination, because imagination did not drift in a draught.",
      tags: [AFTERGLOW],
    },
    {
      text: "Old lamps had layers of afterglow on them, one for every lighting, like rings in a tree or coats of varnish.",
      tags: [AFTERGLOW],
    },
    {
      text: "Ned could see the afterglow of the Lantern's light too, rising from the tower in a thin, golden thread.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "The thread of afterglow above the tower had been thicker once, Ned was almost sure, and now it was the width of a hair.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "A lamplighter who could see afterglow, Ned would learn, was rare enough that the Guild had stopped writing it down.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "He had a habit of looking just past things, at their afterglow, and people often thought he was not listening.",
      tags: [AFTERGLOW],
    },
    {
      text: "Afterglow lit nothing and warmed nothing, but Ned found he could not stop believing it mattered.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "Where afterglow had built up over years, on doorsteps and gateposts, the air felt kind, in a way Ned could not explain.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "Ned saw his own afterglow once, in the window glass, a faint gold edge to his shoulders after a long night of lamps.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "When Ned shut his eyes in the dark, the afterglow was still there, which was the most private thing he knew.",
      tags: [AFTERGLOW, NED],
    },
    {
      text: "The flame in the Lantern had always stood at the same height, and that was the first thing every lamplighter learned.",
      tags: [FLAME],
    },
    {
      text: "Lately it stood a little lower, and nobody said so, which was the second thing Ned learned.",
      tags: [FLAME, NED],
    },
    {
      text: "Every scorch mark above the cage had been made by the flame at its full height, and the flame no longer reached them.",
      tags: [FLAME],
    },
    {
      text: "The gap between the flame and the lowest scorch mark was the width of a hand, and then the width of two.",
      tags: [FLAME],
    },
    {
      text: "The flame did not look ill; it looked calm and tall and a little smaller, like a person who has started to stoop.",
      tags: [FLAME],
    },
    {
      text: "A falling flame, Ned found out, made no noise at all, which was the worst thing about it.",
      tags: [FLAME, NED],
    },
    {
      text: "The brass measuring rod had a notch for every month, and the notches had begun to march downwards.",
      tags: [FLAME],
    },
    {
      text: "At the root, where it met the wick, the flame had gone faintly blue, like a lip in the cold.",
      tags: [FLAME],
    },
    {
      text: "The flame still gave as much light as ever, which was why nobody but the Guild had noticed it was shrinking.",
      tags: [FLAME],
    },
    {
      text: "Each night the flame stood a hair lower, and each night the hours grew a hair shorter.",
      tags: [FLAME],
    },
    {
      text: "Ned worked out, on the back of a sweet wrapper, that at this rate the flame would reach the wick before the month was out.",
      tags: [FLAME, NED],
    },
    {
      text: "He did the sum again on the wall of his bedroom and got the same answer, only larger.",
      tags: [FLAME],
    },
    {
      text: "There was no oil in the Lantern, no coal and no gas, and nobody living could say what kept it burning.",
      tags: [FLAME, MAINS],
    },
    {
      text: "Hattie said a flame that eats nothing is either a miracle or a liar, and she did not believe in miracles before breakfast.",
      tags: [FLAME, HATTIE],
    },
    {
      text: "The flame's warmth reached all the way down the stairs, and lately the bottom steps had gone cold.",
      tags: [FLAME],
    },
    {
      text: "When the flame shrank, the bell rang late, and when the bell rang late, the whole city ran a little slow.",
      tags: [FLAME],
    },
    {
      text: "Ned dreamed about the flame going out, and in the dream there was no sound and no dark, only nothing happening next.",
      tags: [FLAME, NED],
    },
    {
      text: "The flame was the oldest living thing in Candlemere, Old Wick said later, and it had never once been fed properly.",
      tags: [FLAME, WICK],
    },
    {
      text: "The flame had been burning down for longer than anybody had been measuring, which was the sort of fact nobody likes.",
      tags: [FLAME],
    },
    {
      text: "To keep a flame, the Guild said, was to watch it, and for six hundred years the Guild had watched it very carefully.",
      tags: [FLAME],
    },
    {
      text: "Watching, it turned out, was not the same thing as feeding.",
      tags: [FLAME],
    },
    {
      text: "At the bottom of the cage, under the wick, was a bowl of brass, and the bowl had always been empty.",
      tags: [FLAME],
    },
    {
      text: "The flame made the brass bars glow faintly, and lately the glow had crept down the bars like a tide going out.",
      tags: [FLAME],
    },
    {
      text: "Ned could see that the flame had almost no afterglow left, as though it were spending everything it had on burning.",
      tags: [FLAME, AFTERGLOW, NED],
    },
    {
      text: "On the worst nights the flame wavered, very slightly, and the whole city felt it in its bones without knowing why.",
      tags: [FLAME],
    },
    {
      text: "A flame that is going out, said Old Wick, does not flicker; it simply forgets, a little at a time, how tall it was.",
      tags: [FLAME, WICK],
    },
    {
      text: "The scorch marks on the ceiling were a record of every height the flame had ever been, and the newest were the lowest.",
      tags: [FLAME],
    },
    {
      text: "Ned measured the flame with his thumb held out at arm's length, as his mother measured the height of a lamp.",
      tags: [FLAME, NED],
    },
    {
      text: "By his thumb, the flame had lost a knuckle since the spring.",
      tags: [FLAME],
    },
    {
      text: "There was no second flame, no spare and no copy, and the Guild had never needed one, until it did.",
      tags: [FLAME],
    },
    {
      text: "The Guild had known for a year that the flame was falling, and for a year it had said nothing.",
      tags: [SECRET],
    },
    {
      text: "The guild oath forbade any lamplighter to speak against the Lantern, and the masters had decided that the truth counted.",
      tags: [SECRET],
    },
    {
      text: "Velle kept the watch book in a drawer of her desk, under a stack of complaints about oil, where nobody would look.",
      tags: [SECRET, VELLE],
    },
    {
      text: "In the watch book, every night of the last year was written down in her small, neat hand, and every night was a little worse.",
      tags: [SECRET],
    },
    {
      text: "The masters of the Guild met in private that year more often than they had in a century.",
      tags: [SECRET],
    },
    {
      text: "They had told each other that a city that knows its time is running out would panic, and panic is bad for lamps.",
      tags: [SECRET],
    },
    {
      text: "Some of the masters believed the flame would mend itself, the way a cut mends, if only nobody touched it.",
      tags: [SECRET],
    },
    {
      text: "Others believed nothing at all and simply hoped, which in a Guild is called a policy.",
      tags: [SECRET],
    },
    {
      text: "The worst of the secret, Velle said, was not keeping it from the city; it was keeping it from herself.",
      tags: [SECRET, VELLE],
    },
    {
      text: "Lamplighters who asked questions about the flame were told, kindly, that the flame was not their concern.",
      tags: [SECRET],
    },
    {
      text: "The Guild had a word for asking what the Lantern burns, and the word was heresy, though nobody had said it aloud in years.",
      tags: [SECRET],
    },
    {
      text: "There was a page cut out of the roll of lamplighters, and the Guild had been careful never to wonder why.",
      tags: [SECRET],
    },
    {
      text: "Velle had voted to keep the secret, and then lain awake every night since, counting the strokes like everybody else.",
      tags: [SECRET, VELLE],
    },
    {
      text: "Every Warden before her, she suspected, had kept a secret of their own, and passed it on with the key.",
      tags: [SECRET, VELLE],
    },
    {
      text: "A secret in the Guild was kept the way the flame was kept: carefully, faithfully, and without asking what it was for.",
      tags: [SECRET],
    },
    {
      text: "The Guild's secret had a smell, Ned thought, of old paper, cold tea and a drawer that sticks.",
      tags: [SECRET, NED],
    },
    {
      text: "When Ned first asked Velle outright whether the flame was dying, she looked at him for so long that it became an answer.",
      tags: [SECRET, NED, VELLE],
    },
    {
      text: "Maud had always suspected the Guild kept things from its lamplighters, and had always told herself it was for the best.",
      tags: [SECRET, MAUD],
    },
    {
      text: "The masters told the council that the Lantern was in perfect health, and then went home and checked their own clocks.",
      tags: [SECRET],
    },
    {
      text: "A secret kept by three hundred people, Hattie pointed out, was not so much a secret as a very quiet agreement.",
      tags: [SECRET, HATTIE],
    },
    {
      text: "The Guild had kept the watch book for six hundred years, and nobody outside the Guild had ever read a page.",
      tags: [SECRET],
    },
    {
      text: "On the first page of the oldest watch book, Velle said, someone had written a question, and someone else had crossed it out.",
      tags: [SECRET, VELLE],
    },
    {
      text: "The masters spoke of the flame the way people speak of an old relative's health, in low voices and with a lot of looking at the floor.",
      tags: [SECRET],
    },
    {
      text: "Velle had told herself that silence was a way of keeping the flame, and she had very nearly believed it.",
      tags: [SECRET, VELLE],
    },
    {
      text: "The guild oath said ask nothing, and for six hundred years lamplighters had asked nothing, and look where it had got them.",
      tags: [SECRET],
    },
    {
      text: "When the secret came out, Ned noticed, nobody in the Guild seemed surprised, only relieved, and then ashamed of being relieved.",
      tags: [SECRET, NED],
    },
    {
      text: "The library's cut page had been cut by the Guild itself, sixty years before, by a master who had cried while he did it.",
      tags: [SECRET],
    },
    {
      text: "Velle kept the key to the cage on a ribbon round her neck, and lately she had begun to hold it while she talked.",
      tags: [SECRET, VELLE],
    },
    {
      text: "Keeping a secret, Velle told Ned, is like carrying a full lamp up six hundred steps: easy at first, and then not.",
      tags: [SECRET, NED, VELLE],
    },
    {
      text: "The masters had decided, in the end, that the city could be told when there was nothing left to be done, which was a very Guild sort of decision.",
      tags: [SECRET],
    },
    {
      text: "Alderman Silas Crane owned shares in the gas company, a fact he mentioned only when it was likely to help.",
      tags: [MAINS, CRANE],
    },
    {
      text: "He was a large, cheerful man with a gold watch chain, and the watch on the end of it was always right.",
      tags: [MAINS],
    },
    {
      text: "Crane wanted a gas main under every street in Candlemere and a gas lamp on every corner, lit by a tap at the end of the road.",
      tags: [MAINS, CRANE],
    },
    {
      text: "His gas lamps were very bright and very even, and they made everybody's face look like a slightly surprised potato.",
      tags: [MAINS],
    },
    {
      text: "Crane's men dug their trenches in green jackets, with the company's name on the back in letters a foot high.",
      tags: [MAINS, CRANE],
    },
    {
      text: "The trenches were marked out with string and a sign that read Progress, and somebody had added a question mark.",
      tags: [MAINS],
    },
    {
      text: "Crane had a model of Candlemere made of tin, with a tap at the side, and he carried it about like a christening present.",
      tags: [MAINS, CRANE],
    },
    {
      text: "At the turn of the tap, every tin lamp in the model lit at once, and Crane looked at it the way other men look at a sunset.",
      tags: [MAINS, CRANE],
    },
    {
      text: "Crane said that one flame in one tower was no way to run a city, and the annoying thing was that he was right.",
      tags: [MAINS, CRANE],
    },
    {
      text: "He was more comic than cruel, Maud said, which made him much harder to stay angry with.",
      tags: [MAINS, MAUD],
    },
    {
      text: "Crane laughed at his own jokes so heartily that people often laughed too, just to keep him company.",
      tags: [MAINS, CRANE],
    },
    {
      text: "Three wards had gas already, and in those wards the lamplighters had been given a pension and a pat on the back.",
      tags: [MAINS],
    },
    {
      text: "The gas lamps never needed a ladder, a pole or a person, which Crane counted as their chief advantage.",
      tags: [MAINS, CRANE],
    },
    {
      text: "To Ned, a gas street at night looked like a street that had stopped listening.",
      tags: [MAINS, NED],
    },
    {
      text: "The gas lamps hissed softly, all night, like a crowd that did not quite approve of something.",
      tags: [MAINS],
    },
    {
      text: "Crane's posters went up on every wall in the city: gas does not lose time, gas does not climb ladders, gas does not complain.",
      tags: [MAINS, CRANE],
    },
    {
      text: "Hattie added a line in chalk under one poster, gas does not say good evening, and the line stayed up for a week.",
      tags: [MAINS, HATTIE],
    },
    {
      text: "The pipes for the mains were stacked in the square in towers of their own, as though Crane were building a rival.",
      tags: [MAINS, CRANE],
    },
    {
      text: "When the diggers struck an old Guild drain, the whole of Snuff Street smelled of the year before last.",
      tags: [MAINS],
    },
    {
      text: "Crane brought cake to the council meetings, which the councillors said was nothing to do with how they voted.",
      tags: [MAINS, CRANE],
    },
    {
      text: "He had a habit of rocking on his heels when he was pleased with himself, which was often, so that he seemed to be at sea.",
      tags: [MAINS],
    },
    {
      text: "Crane did not hate the Lantern; he simply could not see why anybody would choose to climb six hundred steps when they could turn a tap.",
      tags: [MAINS, CRANE],
    },
    {
      text: "The gas company's office stood on the square, opposite the Guild Hall, and it had larger windows on purpose.",
      tags: [MAINS],
    },
    {
      text: "Every gas lamp that went up meant a hand-lit lamp that came down, and every lamp that came down left the air a little poorer.",
      tags: [MAINS],
    },
    {
      text: "Crane's diggers were mostly from the Fourth Ward, and they lit their pipes from Maud's pole and apologised for the trenches.",
      tags: [MAINS, CRANE, MAUD],
    },
    {
      text: "Crane said progress was like the tide, and Old Wick, when he heard, said that the tide also goes out.",
      tags: [MAINS, CRANE, WICK],
    },
    {
      text: "The first gas street in Candlemere had been the street where Crane lived, which he said was a coincidence.",
      tags: [MAINS, CRANE],
    },
    {
      text: "Crane kept a ledger of every lamp converted to gas, and the ledger was bound in green leather to match his diggers.",
      tags: [MAINS, CRANE],
    },
    {
      text: "When the gas was turned on in a new street, Crane made a speech, and the speeches were getting shorter as the streets got longer.",
      tags: [MAINS, CRANE],
    },
    {
      text: "Under all the speeches and the cake, Crane was a man who liked to know the time, and lately he did not.",
      tags: [MAINS, CRANE],
    },
    {
      text: "The night was four minutes shorter than it should have been, and four minutes, Ned found, is a long time to lose.",
      tags: [MINUTES, NED],
    },
    {
      text: "Nobody could say where the missing minutes went, only that the city woke up tired and could not say why.",
      tags: [MINUTES],
    },
    {
      text: "First it was a minute here and there, then five, then a whole quarter of an hour gone between one stroke and the next.",
      tags: [MINUTES],
    },
    {
      text: "The bakers noticed first, because bread does not care what the bell says, only how long it has had to rise.",
      tags: [MINUTES],
    },
    {
      text: "After the bakers it was the milkmen, then the trams, then the clockmakers, and then, at last, the council.",
      tags: [MINUTES],
    },
    {
      text: "People began to arrive early to things and find they were late, which is the most tiring thing a person can do.",
      tags: [MINUTES],
    },
    {
      text: "The pigeons on the tower ledges took off at the wrong strokes and circled, confused, as if somebody had moved the sky.",
      tags: [MINUTES],
    },
    {
      text: "Ned kept a tally on his bedroom wall, one scratch for every stroke he counted, and the tally kept coming up short.",
      tags: [MINUTES, NED],
    },
    {
      text: "The missing minutes did not feel missing; they felt like a step that is not there in the dark.",
      tags: [MINUTES],
    },
    {
      text: "When the city lost an hour, people argued about what they would have done with it, and the argument took most of the next one.",
      tags: [MINUTES],
    },
    {
      text: "Children in Candlemere were delighted to find the evenings shorter, until they noticed the mornings came sooner too.",
      tags: [MINUTES],
    },
    {
      text: "In the market, traders began to sell by the shadow and not the bell, and the shadow, at least, was reliable.",
      tags: [MINUTES],
    },
    {
      text: "The tower struck eleven twice one night and twelve not at all, and the city went to bed unsure whether it was tomorrow.",
      tags: [MINUTES],
    },
    {
      text: "Some people blamed the bell, some the weather, and some the gas mains, and only the last were anywhere near right.",
      tags: [MINUTES, MAINS],
    },
    {
      text: "Ned began counting strokes without meaning to, at every hour, wherever he was, the way you count stairs in a strange house.",
      tags: [MINUTES, NED],
    },
    {
      text: "When a minute went missing, Ned could almost feel it go, like the pull of a thread coming out of a hem.",
      tags: [MINUTES, NED],
    },
    {
      text: "The clockmakers of Snuff Street tried setting their clocks to the sun and found the sun had opinions of its own.",
      tags: [MINUTES],
    },
    {
      text: "Old women in the Fourth Ward said the days had got shorter when they were girls too, and nobody had the heart to argue.",
      tags: [MINUTES],
    },
    {
      text: "A minute, Ned decided, is a small thing, like a stitch, but enough of them gone and the whole coat comes apart.",
      tags: [MINUTES, NED],
    },
    {
      text: "By the end of the month nobody in Candlemere was quite sure what time it was, and everybody was quite sure it was late.",
      tags: [MINUTES],
    },
    {
      text: "Nobody living remembered how the Lantern had first been lit, and nobody dead had written it down.",
      tags: [FIRST_LIGHTING],
    },
    {
      text: "The brass plate at the foot of the tower gave the year of the first lighting and the name of the first Warden, and nothing else.",
      tags: [FIRST_LIGHTING, VELLE],
    },
    {
      text: "The first lighting, Old Wick said, was not a secret; it was a craft that had been forgotten, which is worse, because nobody looks for it.",
      tags: [FIRST_LIGHTING, WICK],
    },
    {
      text: "To light a flame that eats afterglow, you need a wick of old wicks, a glass of the old measure, and an eye that can see.",
      tags: [FIRST_LIGHTING, AFTERGLOW],
    },
    {
      text: "The old measure was thinner than any lamp-glass made in the city now, thin enough to ring at a touch.",
      tags: [FIRST_LIGHTING],
    },
    {
      text: "The wick for the first lighting had to be braided from the wicks of every ward, so that every street was in the flame.",
      tags: [FIRST_LIGHTING],
    },
    {
      text: "A flame lit from afterglow, Old Wick said, burns on what lamps remember, and lamps remember everything.",
      tags: [FIRST_LIGHTING, AFTERGLOW, WICK],
    },
    {
      text: "Ned practised lighting candles from afterglow until he could do it without holding his breath.",
      tags: [FIRST_LIGHTING, AFTERGLOW, NED],
    },
    {
      text: "The trick was not to reach for the afterglow but to let the wick find it, like a moth finding a window.",
      tags: [FIRST_LIGHTING, AFTERGLOW],
    },
    {
      text: "Hattie said lighting from afterglow sounded like nonsense, and then she watched Ned do it and said it was still nonsense, but it worked.",
      tags: [FIRST_LIGHTING, AFTERGLOW, NED, HATTIE],
    },
    {
      text: "The old moulds of the Glassworks held the old measure, and nobody had used them since the first lighting.",
      tags: [FIRST_LIGHTING],
    },
    {
      text: "In the Guild's oldest book there was a drawing of the first lighting, and in the drawing the Warden was a child.",
      tags: [FIRST_LIGHTING, VELLE],
    },
    {
      text: "The first lighting needed someone who could see afterglow, Old Wick said, and the Guild had spent six hundred years forgetting that such people existed.",
      tags: [FIRST_LIGHTING, AFTERGLOW, WICK],
    },
    {
      text: "A first lighting cannot be hurried, said Old Wick, any more than a loaf can, or a child, or a goat.",
      tags: [FIRST_LIGHTING, WICK],
    },
    {
      text: "Every lamp lit by hand, Ned came to understand, was a small first lighting, done again every night.",
      tags: [FIRST_LIGHTING, NED],
    },
  ],
});
