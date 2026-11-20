// The phrase bank of Down the Tolle, in the voice of the show.
import type { DialogueEntry, LineIntent, StyleGuide } from "../../guide.ts";

type Line = readonly [LineIntent, string];

interface Episode {
  place: string;
  /** The one voice from that place, beside the host. */
  voice: { cue: string; name: string };
  timeOfDay: string;
  summary: string;
  /** The episode's running time and its cue bracket; null while the episode is only an outline. */
  story: { durMs: number; bracket: string } | null;
  lines: readonly [Line, Line, Line, Line, Line];
}

const HOST = { cue: "ANIL", name: "Anil Bhattacharya" };

/** About a minute and a quarter of read speech to a page; fitting the text to pages settles the real count. */
const SPOKEN_MS_PER_PAGE = 75_000;

const EPISODES: readonly Episode[] = [
  {
    place: "EXT. HARROW FELL - THE SPRING",
    voice: { cue: "BRYONY", name: "Bryony Askew" },
    timeOfDay: "DAWN",
    summary:
      "Bryony Askew walks Anil up Harrow Fell before the sheep are moving, to the stone where the Tolle comes out of the hill.",
    story: {
      durMs: 1_880_000,
      bracket: "T=0:35 water leaving the rock, recorded at the spring",
    },
    lines: [
      [
        "answer",
        "It comes out under that flat stone, the one with the iron ring. My grandfather swore somebody put the ring there to stop the river running off.",
      ],
      [
        "state",
        "In a dry August you can stop the whole Tolle with the flat of your hand. I've done it. It felt like holding a door shut.",
      ],
      [
        "answer",
        "Nobody owns the spring. The farm owns the field, the field owns the stone, and the water just leaves without asking.",
      ],
      [
        "state",
        "Walkers come up here expecting a fountain. They find a wet patch and a sheep looking at them.",
      ],
      [
        "answer",
        "Forty minutes from the car park if you don't stop. You'll stop. Everyone stops at the second gate for the view.",
      ],
    ],
  },
  {
    place: "EXT. THE SHEPHERD'S BRIDGE",
    voice: { cue: "HUGH", name: "Hugh Garside" },
    timeOfDay: "MORNING",
    summary:
      "Hugh Garside drives his flock over the narrow bridge his great-grandfather rebuilt after a winter flood, and counts them across.",
    story: {
      durMs: 1_665_000,
      bracket: "T=0:30 a flock crossing, hooves on stone",
    },
    lines: [
      [
        "answer",
        "It's one sheep wide, that bridge, on purpose. You count them over one at a time, and by the far side you know if one's missing.",
      ],
      [
        "state",
        "My great-grandfather rebuilt it after the flood took the old one. He carried every stone up from the beck on his back, or so the family says.",
      ],
      [
        "answer",
        "Three hundred and twelve this morning. Three hundred and eleven yesterday, but one of those was hiding under a gorse bush.",
      ],
      [
        "state",
        "There's a mark on the parapet where he cut his initials. Somebody's added a heart since. I've left it.",
      ],
      [
        "answer",
        "Walkers think it's a footbridge. It's a counting bridge. That's the whole point of it.",
      ],
    ],
  },
  {
    place: "INT. FELLSIDE MILL",
    voice: { cue: "PEARL", name: "Pearl Hindmarsh" },
    timeOfDay: "DAY",
    summary:
      "Pearl Hindmarsh unlocks the mill that has had no miller for sixty years, and shows Anil the wheel that still turns when the river is high.",
    story: {
      durMs: 1_750_000,
      bracket: "T=0:45 the wheel turning empty in high water",
    },
    lines: [
      [
        "answer",
        "The last miller walked out one Friday and never came back for his coat. It's still on the peg. Nobody's had the heart to move it.",
      ],
      [
        "state",
        "When the river's up, the wheel turns on its own. No grain, no stones engaged. It just turns, as if it's remembering.",
      ],
      [
        "answer",
        "I keep the key because my mother kept the key. Nobody ever asked either of us to.",
      ],
      [
        "state",
        "Children ask me who the miller is now. I tell them the river. They seem to think that's fair.",
      ],
      [
        "answer",
        "Flour dust in the beams, still. Knock one with a broom and the whole room goes white for a minute.",
      ],
    ],
  },
  {
    place: "EXT. OTTER POOL",
    voice: { cue: "GILES", name: "Giles Ormerod" },
    timeOfDay: "DUSK",
    summary:
      "Giles Ormerod sits on the bank at dusk where the pool got its name, waiting for the otters that came back this year.",
    story: {
      durMs: 1_535_000,
      bracket: "T=0:40 dusk at the pool, a splash off the far bank",
    },
    lines: [
      [
        "answer",
        "The pool was named for otters nobody here had seen in living memory. Then this spring there were tracks in the mud, right by the alder.",
      ],
      [
        "state",
        "You don't look for an otter. You look for a line on the water that's going the wrong way.",
      ],
      [
        "answer",
        "Patience, mostly, and a flask. I've sat here forty evenings this year and seen one twice.",
      ],
      [
        "state",
        "My wife says I've finally found a hobby that suits me: sitting still and saying nothing.",
      ],
      [
        "answer",
        "Clean water, that's all it took. Forty years of people quietly not tipping things into the river.",
      ],
    ],
  },
  {
    place: "EXT. THE DROVER'S FORD",
    voice: { cue: "NETTIE", name: "Nettie Brough" },
    timeOfDay: "MORNING",
    summary:
      "Nettie Brough wades the ford her family's cattle crossed on the way to market, and shows Anil the paving under the water.",
    story: {
      durMs: 2_030_000,
      bracket: "T=0:30 boots in shallow water over the ford's paving",
    },
    lines: [
      [
        "answer",
        "There's stone paving under there, laid flat for cattle. You can feel it through your boots if you walk the right line.",
      ],
      [
        "state",
        "My great-great-grandmother drove forty head through here to the city market. Two days on foot, and she came back with a clock.",
      ],
      [
        "answer",
        "Knee deep in summer, chest deep in March. You don't cross in March. Nobody sensible ever did.",
      ],
      [
        "state",
        "The clock's on my kitchen wall. It loses four minutes a day, which the family takes as tradition.",
      ],
      [
        "answer",
        "People think a ford is just a shallow bit. It isn't. Somebody made it shallow, and kept it that way.",
      ],
    ],
  },
  {
    place: "INT. THE BELL CHAPEL",
    voice: { cue: "CLIVE", name: "Clive Penhallow" },
    timeOfDay: "EVENING",
    summary:
      "Clive Penhallow rings the one bell that three villages share, and explains the rota for weddings that is older than any of their churches.",
    story: {
      durMs: 1_705_000,
      bracket: "T=0:25 one bell rung slowly, three times",
    },
    lines: [
      [
        "answer",
        "Three villages, one bell, and one rope with three colours of tape on it. Each village pulls from its own colour.",
      ],
      [
        "state",
        "The rota for weddings is kept in a tin, in pencil, and nobody's allowed a rubber.",
      ],
      [
        "answer",
        "We ring it for anyone who asks, from any of the three. The arguments are about who rings it, never whether.",
      ],
      [
        "state",
        "A bell that size carries five miles on a still night. On a windy one it barely reaches the pub.",
      ],
      [
        "answer",
        "I took the rope over from my uncle. He told me never to ring it angry. You can hear it if you do.",
      ],
    ],
  },
  {
    place: "EXT. LINNET WOOD",
    voice: { cue: "MAGGIE", name: "Maggie Rennard" },
    timeOfDay: "AFTERNOON",
    summary:
      "Maggie Rennard leads Anil to the clearing in Linnet Wood where a hermit lived for thirty years, and to the bench he left behind.",
    story: {
      durMs: 1_805_000,
      bracket: "T=0:30 wind in the trees, a woodpecker far off",
    },
    lines: [
      [
        "answer",
        "He wasn't a hermit, really. He came into the village every Thursday for bread and a newspaper, and argued with the baker about the weather.",
      ],
      [
        "state",
        "The bench is all that's left of his hut. He made it from one oak that came down in a storm.",
      ],
      [
        "answer",
        "Thirty years in the wood, and he knew every bird by its call. He kept a list of them on the back of a door.",
      ],
      [
        "state",
        "People still leave things on the bench. A pine cone, a coin, once a whole loaf of bread.",
      ],
      [
        "answer",
        "The door's in the village hall now. Children read the list as if it's a poem. It nearly is.",
      ],
    ],
  },
  {
    place: "EXT. THE CART BRIDGES",
    voice: { cue: "DERMOT", name: "Dermot Halpin" },
    timeOfDay: "DAY",
    summary:
      "Dermot Halpin, a stonemason, walks Anil past four narrow bridges built for carts, which now carry delivery vans with a mirror's width to spare.",
    story: {
      durMs: 1_600_000,
      bracket: "T=0:20 a van inching over a stone bridge",
    },
    lines: [
      [
        "answer",
        "They were built exactly as wide as a hay cart and not an inch more. Stone was dear and so were masons.",
      ],
      [
        "state",
        "Every time a van gets stuck, someone writes to the council asking for the bridge to be widened. I write back asking for smaller vans.",
      ],
      [
        "answer",
        "Four of them in six miles, and no two arches the same shape. Each village used its own mason, and each mason had opinions.",
      ],
      [
        "state",
        "You can see the cart ruts worn into the setts, if you kneel down. Most people won't kneel.",
      ],
      [
        "answer",
        "A bridge like this will see off the new road. It's got no interest in being replaced.",
      ],
    ],
  },
  {
    place: "INT. THE PAPER MILL",
    voice: { cue: "WINIFRED", name: "Winifred Starling" },
    timeOfDay: "DAY",
    summary:
      "Winifred Starling, whose father made paper here, shows Anil the drying loft and holds a sheet with the mill's watermark up to the window.",
    story: {
      durMs: 1_935_000,
      bracket: "T=0:35 a dry sheet of paper lifted and shaken",
    },
    lines: [
      [
        "answer",
        "Hold it up to the light. See the little heron? That's the mill's mark. My father said it was the only bird that never left.",
      ],
      [
        "state",
        "Good paper needs clean water, which is why the mill is up here and not down in the city.",
      ],
      [
        "answer",
        "The drying loft was where courting happened. All those sheets on lines, and nobody could see you between them.",
      ],
      [
        "state",
        "I've still got a ream from the last week it ran. I won't write on it. I'm not sure what would be good enough.",
      ],
      [
        "answer",
        "It closed when I was nine. I remember the quiet more than the noise, and the noise was enormous.",
      ],
    ],
  },
  {
    place: "EXT. THE FLOOD BARN",
    voice: { cue: "SEAMUS", name: "Seamus Corley" },
    timeOfDay: "AFTERNOON",
    summary:
      "Seamus Corley shows Anil the line painted on his barn wall where the great flood reached, and the years painted under it in smaller letters.",
    story: {
      durMs: 1_490_000,
      bracket: "T=0:20 rain on a corrugated roof",
    },
    lines: [
      [
        "answer",
        "The top line is the big flood. It's above my head, and the barn's on a rise. My grandmother sat on the roof with two hens.",
      ],
      [
        "state",
        "Every flood since gets a line and a year. Most are down by my knee. That's the river being polite.",
      ],
      [
        "answer",
        "We repaint them every spring. If you let a flood mark fade, people start building where they shouldn't.",
      ],
      [
        "state",
        "Visitors stand under the top line and go quiet. I've seen grown men put a hand flat on the wall.",
      ],
      [
        "answer",
        "The hens survived. So did my grandmother. She never trusted the river again, and she lived to ninety-six.",
      ],
    ],
  },
  {
    place: "EXT. HESSLE END - THE ORCHARDS",
    voice: { cue: "ROSEMARY", name: "Rosemary Tindall" },
    timeOfDay: "MORNING",
    summary:
      "Rosemary Tindall walks Anil through the riverside orchards at Hessle End, where every tree is a kind of apple that grows nowhere else.",
    story: {
      durMs: 1_770_000,
      bracket: "T=0:30 apples dropping into a basket",
    },
    lines: [
      [
        "answer",
        "There are nineteen kinds of apple here that you won't find in any shop. Half of them don't have names, just the number of the row.",
      ],
      [
        "state",
        "The river gives us mist in the mornings, and the mist keeps the frost off. Without the Tolle, there'd be no orchard.",
      ],
      [
        "answer",
        "Row six, tree four. Sour as a lemon in October, sweet as anything by midwinter. You have to wait for it.",
      ],
      [
        "state",
        "My father grafted every tree in the bottom field. I can tell you which ones he did when he was in a temper.",
      ],
      [
        "answer",
        "We sell at the gate, with an honesty box. Once someone left a jar of honey instead of money. I counted that as paid.",
      ],
    ],
  },
  {
    place: "EXT. THE LOCK-KEEPER'S COTTAGE",
    voice: { cue: "AGNES", name: "Agnes Welbury" },
    timeOfDay: "DAY",
    summary:
      "Agnes Welbury, whose father kept the lock for forty years, works the gates for Anil and remembers the boats she waved through as a girl.",
    story: {
      durMs: 2_115_000,
      bracket: "T=0:45 lock gates opening, water rushing through the sluice",
    },
    lines: [
      [
        "answer",
        "I could work these gates before I could ride a bicycle. Father said a lock-keeper's daughter learns the river before her letters.",
      ],
      [
        "state",
        "The barges came up loaded and went down empty. You could tell the season by what they carried.",
      ],
      [
        "answer",
        "Forty years he kept it, and he logged every boat. The books are in the cottage. I read one every winter.",
      ],
      [
        "state",
        "When they stopped the barges, he kept opening the gates every morning anyway, for nothing, just in case.",
      ],
      [
        "answer",
        "The worst night was a boat stuck in the chamber in a flood. Father went down the ladder in the dark. I held the lamp.",
      ],
    ],
  },
  {
    place: "EXT. KINGFISHER BANK",
    voice: { cue: "TOBY", name: "Toby Fairlie" },
    timeOfDay: "DAWN",
    summary:
      "Toby Fairlie, a schoolteacher, takes Anil to the bank where the kingfishers nest, and they wait for a flash of blue before the school bus comes.",
    story: {
      durMs: 1_505_000,
      bracket: "T=0:30 a kingfisher's call over the river at dawn",
    },
    lines: [
      [
        "answer",
        "You don't see a kingfisher. You see that you just missed one. A blue line, then nothing, then you wonder if you dreamt it.",
      ],
      [
        "state",
        "They nest in a tunnel in the bank, right there under the roots. They dig it with their beaks, an arm's length in.",
      ],
      [
        "answer",
        "I bring my class every June. Thirty children told to be quiet for ten minutes. It's the only time it ever works.",
      ],
      [
        "state",
        "One morning I counted seven dives in a minute. Then the bus came round the corner and I had to leave.",
      ],
      [
        "answer",
        "If the water's cloudy, they can't see the fish. So a kingfisher is really a sign that the river's doing well.",
      ],
    ],
  },
  {
    place: "EXT. THE DRY CANAL",
    voice: { cue: "LEONARD", name: "Leonard Copsey" },
    timeOfDay: "AFTERNOON",
    summary:
      "Leonard Copsey walks Anil along the bed of a canal that was dug, lined and bridged, and never once filled with water.",
    story: {
      durMs: 2_020_000,
      bracket: "T=0:25 footsteps on the dry bed of the canal",
    },
    lines: [
      [
        "answer",
        "They dug eleven miles of it. Built three bridges and a lock. Then the money ran out the week before they let the water in.",
      ],
      [
        "state",
        "The lock gates were sold for firewood the winter after. You can still see the bolt holes in the stone.",
      ],
      [
        "answer",
        "Nobody quite knows who lost the money. Every family round here blames a different great-grandfather.",
      ],
      [
        "state",
        "It's full of foxgloves in summer. A canal of flowers, if you're feeling generous.",
      ],
      [
        "answer",
        "I walk it once a year, end to end. It takes all day, and not once do I get my feet wet.",
      ],
    ],
  },
  {
    place: "EXT. THE ISLAND CHURCH",
    voice: { cue: "HAZEL", name: "Hazel Gethin" },
    timeOfDay: "MORNING",
    summary:
      "Hazel Gethin rows Anil out to the little church on an island in the river, as its churchwardens have rowed the vicar every Sunday for two hundred years.",
    story: {
      durMs: 1_735_000,
      bracket: "T=0:35 oars in the water, a boat grounding on gravel",
    },
    lines: [
      [
        "answer",
        "There's no bridge and there never was. If you want to be married here, you come by boat, and so does the bride.",
      ],
      [
        "state",
        "The churchwarden rows the vicar across every Sunday. When I took the job, nobody mentioned the rowing.",
      ],
      [
        "answer",
        "Twelve pews, a font and a stove. In winter we light the stove and the congregation sits as close as they dare.",
      ],
      [
        "state",
        "When the river floods, the island goes under to the second step. The water's never come through the door.",
      ],
      [
        "answer",
        "Two hundred years of rowing, and not one wedding party has gone in. A best man, once, but only to his knees.",
      ],
    ],
  },
  {
    place: "EXT. THE GRAVEL WHARF",
    voice: { cue: "STAN", name: "Stan Coultard" },
    timeOfDay: "DAY",
    summary:
      "Stan Coultard, the last skipper of the gravel barges, shows Anil the empty wharf and tells him where in the city his loads ended up.",
    story: {
      durMs: 1_820_000,
      bracket: "T=0:30 gravel poured from a shovel onto a heap",
    },
    lines: [
      [
        "answer",
        "Half the city's pavements came down this river in my barge. Every time I walk in Lannick, I'm walking on my old loads.",
      ],
      [
        "state",
        "Sixty tons a trip, and you steered by the colour of the water. Brown was deep, yellow was trouble.",
      ],
      [
        "answer",
        "The last load went in a September. It was lorries after that. Faster, they said. I said nobody had asked the lorry.",
      ],
      [
        "state",
        "My barge is a houseboat now, painted green. I went aboard once. They'd put a sofa where the wheel was.",
      ],
      [
        "answer",
        "You learn a river from a barge. Every bend has a name, and every name has a story, usually about someone running aground.",
      ],
    ],
  },
  {
    place: "EXT. HARROW FELL QUARRY",
    voice: { cue: "ELLEN", name: "Ellen Bassett" },
    timeOfDay: "DAY",
    summary:
      "Ellen Bassett, whose husband cut stone on Harrow Fell, takes Anil into the quarry, now a lake, and names the bridges that came out of it.",
    story: {
      durMs: 1_915_000,
      bracket: "T=0:30 a stone dropped into deep water",
    },
    lines: [
      [
        "answer",
        "Every bridge on the upper river came out of this hill. You can match the stone by its colour, grey with a pink vein.",
      ],
      [
        "state",
        "When they stopped cutting, the quarry filled with rain. Now it's a lake nobody swims in, because it's colder than it looks.",
      ],
      [
        "answer",
        "My husband cut stone here for thirty-two years. He could tell a good block by knocking on it, like a melon.",
      ],
      [
        "state",
        "There are names chiselled into the face up there. The quarrymen signed their work where only the birds could read it.",
      ],
      [
        "answer",
        "On a still day the water's so clear you can see the old crane at the bottom, lying on its side as if it's resting.",
      ],
    ],
  },
  {
    place: "EXT. THE WATER MEADOWS",
    voice: { cue: "COLIN", name: "Colin Fairbrass" },
    timeOfDay: "EVENING",
    summary:
      "Colin Fairbrass opens the old sluices on the water meadows, and Anil watches the river spread across the grass the way it was meant to.",
    story: {
      durMs: 1_650_000,
      bracket: "T=0:35 water spilling over a sluice into grass",
    },
    lines: [
      [
        "answer",
        "You flood the meadow on purpose, a thin sheet of water, and it keeps the grass warm. First green in the valley, every year.",
      ],
      [
        "state",
        "The channels were dug by hand three hundred years ago. We still clear them with the same shape of spade.",
      ],
      [
        "answer",
        "Cattle love it. They stand in the wet grass in the evening looking as if they've won something.",
      ],
      [
        "state",
        "The trick is to let the water move. Still water rots the roots. Moving water feeds them.",
      ],
      [
        "answer",
        "There used to be a man whose whole job was the sluices. Now it's me, every Wednesday, after the milk round.",
      ],
    ],
  },
  {
    place: "EXT. LINNET FERRY",
    voice: { cue: "NORMAN", name: "Norman Iveson" },
    timeOfDay: "EVENING",
    summary:
      "Norman Iveson, son of the last ferryman at Linnet, pulls Anil across by hand on the chain ferry his father worked for a fare of nothing.",
    story: {
      durMs: 2_045_000,
      bracket: "T=0:40 a chain rattling over a pulley, water lapping",
    },
    lines: [
      [
        "answer",
        "It's a chain ferry. You pull the chain and the boat follows it across. No engine, no oars, just your arms and the river's patience.",
      ],
      [
        "state",
        "My father charged a penny until pennies stopped. Then he charged nothing and said it was easier to count.",
      ],
      [
        "answer",
        "There's a bell on the far bank. You ring it and wait. He'd come at any hour, even in his slippers.",
      ],
      [
        "state",
        "Linnet has two halves and one ferry, so everyone in the village has crossed with my family at least once.",
      ],
      [
        "answer",
        "The council offered a bridge in the eighties. The village voted no. They'd rather wait for the bell.",
      ],
    ],
  },
  {
    place: "EXT. THE CITY BOUNDARY STONE",
    voice: { cue: "DEVIKA", name: "Devika Sood" },
    timeOfDay: "MORNING",
    summary:
      "Devika Sood, a surveyor, stands with Anil at the boundary stone where the fields end and the Tolle first meets the edge of Lannick.",
    story: {
      durMs: 2_180_000,
      bracket: "T=0:30 a tram bell far off, birds close by",
    },
    lines: [
      [
        "answer",
        "On this side of the stone, the river's a farmer's problem. On that side, it's the city's. The water has never noticed.",
      ],
      [
        "state",
        "You can hear the first tram from here, if the wind's right. Fields on your left, the number nine on your right.",
      ],
      [
        "answer",
        "The stone's been moved twice, both times by the city, both times in the middle of the night. We surveyors remember these things.",
      ],
      [
        "state",
        "This is where the river stops being scenery and starts being work. Bridges, walls, drains, the lot.",
      ],
      [
        "answer",
        "I've measured every inch of the city boundary, and this is the only spot I come back to when I'm not being paid.",
      ],
    ],
  },
  {
    place: "EXT. HALSE WEIR",
    voice: { cue: "KENNETH", name: "Kenneth Ruddock" },
    timeOfDay: "DAWN",
    summary:
      "Kenneth Ruddock checks the weir at Halse at dawn, as he does every day, and explains why the whole city depends on a wall of stone two metres high.",
    story: {
      durMs: 1_985_000,
      bracket: "T=0:45 the roar of water over the weir",
    },
    lines: [
      [
        "answer",
        "Above the weir, the river belongs to the hills. Below it, it belongs to the tide. My job is to keep them arguing politely.",
      ],
      [
        "state",
        "Every morning I walk the crest and look for what came down in the night. Mostly branches. Once a garden shed.",
      ],
      [
        "answer",
        "Two metres of stone, and it holds back enough water to keep the city's feet dry. People drive past it without a glance.",
      ],
      [
        "state",
        "The roar's so steady you stop hearing it. Then it changes pitch, and you're out of bed before you know why.",
      ],
      [
        "answer",
        "The salmon ladder's on the far side. In autumn you can watch them try it, again and again, until they make it.",
      ],
    ],
  },
  {
    place: "EXT. HALSE PARK",
    voice: { cue: "GLADYS", name: "Gladys Hurrell" },
    timeOfDay: "AFTERNOON",
    summary:
      "Gladys Hurrell, born beside Halse Park, sits with Anil on the bandstand steps and describes the park before the tramline cut through it.",
    story: {
      durMs: 1_790_000,
      bracket: "T=0:30 children in a playground, a brass band rehearsing",
    },
    lines: [
      [
        "answer",
        "Before the trams, the park went right down to the river. You could roll a hoop from the gates to the water.",
      ],
      [
        "state",
        "The tramline took a strip as wide as a road. They planted a hedge so we wouldn't have to look at it.",
      ],
      [
        "answer",
        "There was a boating pond where the depot is now. My father proposed to my mother in a hired rowing boat.",
      ],
      [
        "state",
        "Sunday afternoons it was the band, the ducks and every family in the street. You wore your good shoes.",
      ],
      [
        "answer",
        "I don't mind the trams. I just want people to know there was grass there, and somebody's mother said yes on it.",
      ],
    ],
  },
  {
    place: "INT. THE OLD DYE WORKS",
    voice: { cue: "SHEILA", name: "Sheila Marwood" },
    timeOfDay: "DAY",
    summary:
      "Sheila Marwood, who mixed colours at the dye works, walks Anil through the empty sheds before the builders arrive, and remembers the days the river ran blue.",
    story: {
      durMs: 2_200_000,
      bracket: "T=0:30 footsteps and pigeons in an empty shed",
    },
    lines: [
      [
        "answer",
        "On a Monday the river ran blue, on a Tuesday red. People below the works set their washing days by it.",
      ],
      [
        "state",
        "My hands were green for a year once. A whole batch for the railway, and the gloves were rubbish.",
      ],
      [
        "answer",
        "They've approved a hundred and forty homes on this site. I hope somebody in one of them finds a blue brick.",
      ],
      [
        "state",
        "The river was dead for a mile below us, and none of us said it out loud. We needed the wages.",
      ],
      [
        "answer",
        "When it closed, the water came clear within a year. That's how fast a river forgives, if you let it.",
      ],
    ],
  },
  {
    place: "EXT. CALLOW STREET",
    voice: { cue: "BARRY", name: "Barry Nuttall" },
    timeOfDay: "MORNING",
    summary:
      "Barry Nuttall, who was eight the year Callow Street flooded, shows Anil the doorstep he was carried off and the height the water reached on the lamp post.",
    story: {
      durMs: 1_940_000,
      bracket: "T=0:25 rain in a gutter, a front door opening",
    },
    lines: [
      [
        "answer",
        "I was eight. My dad carried me out on his shoulders, and I remember thinking it was the best night of my life.",
      ],
      [
        "state",
        "The water came up to the second stair. Mum's piano floated. It never played in tune again, but it played.",
      ],
      [
        "answer",
        "There's a brass ring on the lamp post at the corner. That's how high it got. Kids still jump to touch it.",
      ],
      [
        "state",
        "The whole street lived upstairs for a week. We passed tea along the windows on a broom handle.",
      ],
      [
        "answer",
        "They built the wall after that, and it's never come over since. I still check the gutter when it rains.",
      ],
    ],
  },
  {
    place: "EXT. EXCHANGE SQUARE",
    voice: { cue: "FATIMA", name: "Fatima Bajwa" },
    timeOfDay: "DAY",
    summary:
      "Fatima Bajwa, who has sold flowers on Exchange Square for twenty-two years, tells Anil what the square looks like from a stall on the corner.",
    story: {
      durMs: 2_295_000,
      bracket: "T=0:35 a busy square, pigeons, a street cleaner's brush",
    },
    lines: [
      [
        "answer",
        "Twenty-two years on this corner. I know every councillor by what they buy. The ones who buy nothing, I know best.",
      ],
      [
        "state",
        "When the council votes, the square fills up with people waiting. Waiting people buy flowers. Nobody knows why.",
      ],
      [
        "answer",
        "The river used to come right up to the square. The old mooring rings are still in the paving, by the bins.",
      ],
      [
        "state",
        "The pigeons here have opinions. They sit on the roof of the hall as if they're on the committee.",
      ],
      [
        "answer",
        "Best day was the cup replay. Every second person wanted something in the club colours. I sold out by six.",
      ],
    ],
  },
  {
    place: "INT. THE TOLLE EXCHANGE - CLOCK ROOM",
    voice: { cue: "ALBERT", name: "Albert Crisp" },
    timeOfDay: "AFTERNOON",
    summary:
      "Albert Crisp climbs the Tolle Exchange tower with Anil to wind the clock, as he has every Sunday for nineteen years in a building with nobody else in it.",
    story: {
      durMs: 1_830_000,
      bracket: "T=0:40 the clock ticking, a winding handle turning",
    },
    lines: [
      [
        "answer",
        "Two hundred and eleven steps, and a key the size of my forearm. Forty turns for the hands, sixty for the strike.",
      ],
      [
        "state",
        "Twelve years empty downstairs, and the clock never missed a Sunday. Somebody had to keep the building's heart going.",
      ],
      [
        "answer",
        "Nobody asked me to. The last winder handed me the key in a pub and said I had the knees for it.",
      ],
      [
        "state",
        "There are pigeons up here who think I'm part of the works. They don't even move when I come in.",
      ],
      [
        "answer",
        "If it's a minute slow, the whole square tells me. People set their watches by it and then complain.",
      ],
    ],
  },
  {
    place: "INT. MERCER STREET LIBRARY",
    voice: { cue: "MONICA", name: "Monica Pennock" },
    timeOfDay: "DAY",
    summary:
      "Monica Pennock, the branch librarian on Mercer Street, shows Anil the reading room by the river and the shelf of books that came back decades late.",
    story: {
      durMs: 1_675_000,
      bracket: "T=0:25 pages turning, a date stamp coming down",
    },
    lines: [
      [
        "answer",
        "We have a shelf of books returned decades late. Every one came with a note. Most of them say sorry. One says it was worth it.",
      ],
      [
        "state",
        "The reading room windows look straight onto the river. People come in for a book and stay for the water.",
      ],
      [
        "answer",
        "If the Exchange becomes the central library, we stay open. Small libraries are where people learn to like big ones.",
      ],
      [
        "state",
        "Mercer Street flooded once, and we carried the children's books upstairs first. Nobody had to be told.",
      ],
      [
        "answer",
        "The record is fifty-one years. A book about knots, returned by the son of the man who borrowed it. He'd learned every one.",
      ],
    ],
  },
  {
    place: "EXT. THE TOLLE BRIDGE",
    voice: { cue: "ROY", name: "Roy Ashdown" },
    timeOfDay: "NIGHT",
    summary:
      "Roy Ashdown, the engineer who looks after the Tolle Bridge, walks Anil out to the middle at night and shows him the joints that let it breathe.",
    story: {
      durMs: 2_460_000,
      bracket: "T=0:40 traffic and a tram crossing the bridge",
    },
    lines: [
      [
        "answer",
        "The bridge moves. Not much, a few centimetres between summer and winter, but it moves. These joints are where it breathes.",
      ],
      [
        "state",
        "Two trams pass in the middle at the same moment, every evening at about six. The whole deck hums like a plucked string.",
      ],
      [
        "answer",
        "We close it at night to resurface it, ten till five, four nights running. Every one of those nights, somebody tries to walk across.",
      ],
      [
        "state",
        "The middle span was lifted into place in one morning. There's a photograph of the whole city watching from the banks.",
      ],
      [
        "answer",
        "If you stand here at slack water, you can't tell which way the river's going. That's the only time it's quiet.",
      ],
    ],
  },
  {
    place: "EXT. UNDER THE TOLLE BRIDGE",
    voice: { cue: "JADE", name: "Jade Ostrowski" },
    timeOfDay: "EVENING",
    summary:
      "Jade Ostrowski, a youth worker, sits with Anil under the bridge where skaters, pigeons and buskers share the dry ground and the echo.",
    story: {
      durMs: 1_720_000,
      bracket: "T=0:35 skateboard wheels on concrete, echoing under the arches",
    },
    lines: [
      [
        "answer",
        "It's the only dry, flat, lit ground in the city that nobody's charging for. So everybody comes here, and mostly they get along.",
      ],
      [
        "state",
        "The echo's the best in Lannick. Buskers argue over the middle arch. A trumpet down here sounds like a whole band.",
      ],
      [
        "answer",
        "The kids painted the pillars, the council painted over them, and the kids painted them again. It's been going on for years.",
      ],
      [
        "state",
        "When a tram goes over, the whole place drums. The skaters time their tricks to it.",
      ],
      [
        "answer",
        "I've had more honest conversations under this bridge than in any office. Nobody has to look at anyone, you see.",
      ],
    ],
  },
  {
    place: "EXT. THE ROWING CLUBS",
    voice: { cue: "PHILIPPA", name: "Philippa Garth" },
    timeOfDay: "DAWN",
    summary:
      "Philippa Garth, captain of the older of the two rowing clubs, takes Anil out at dawn and explains a rivalry that began over a borrowed oar.",
    story: {
      durMs: 1_885_000,
      bracket: "T=0:30 oars dipping in time, a cox calling the stroke",
    },
    lines: [
      [
        "answer",
        "Two clubs, one stretch of river, and a hundred years of not speaking. It started over an oar that was borrowed and never returned.",
      ],
      [
        "state",
        "We row at dawn because the water's flat and the barges aren't up. Also, it keeps the other club guessing.",
      ],
      [
        "answer",
        "The oar's on our wall. They say it's theirs. It is theirs. We're not giving it back.",
      ],
      [
        "state",
        "Once a year we race them from the weir to the bridge. Whoever loses buys breakfast, and the breakfasts are enormous.",
      ],
      [
        "answer",
        "Last spring a boat from each club went out to free a swan tangled in fishing line. It was the first time we'd ever worked together.",
      ],
    ],
  },
  {
    place: "INT. THE TRAM DEPOT",
    voice: { cue: "WINSTON", name: "Winston Pryor" },
    timeOfDay: "NIGHT",
    summary:
      "Winston Pryor, a fitter on the night shift at the tram depot, shows Anil the old trams that are kept running and the new drivers learning to brake.",
    story: {
      durMs: 2_050_000,
      bracket: "T=0:35 a tram's motor winding down in a shed, tools on a bench",
    },
    lines: [
      [
        "answer",
        "We've got trams in here older than my grandad, and they still run. Keep a thing oiled and talk to it, and it'll go forever.",
      ],
      [
        "state",
        "Forty new drivers this year. They learn to brake on the depot loop before they're let anywhere near a passenger.",
      ],
      [
        "answer",
        "Night shift is when the real work happens. The city's asleep, and we're underneath the trams with torches.",
      ],
      [
        "state",
        "Every tram has a personality. Number fourteen pulls left. Number thirty-two won't start until you've said good morning.",
      ],
      [
        "answer",
        "The depot was a boatyard before it was trams. There's still a slipway under the floor of bay six.",
      ],
    ],
  },
  {
    place: "INT. CENTRAL STATION - CELLARS",
    voice: { cue: "MARTIN", name: "Martin Uttley" },
    timeOfDay: "DAY",
    summary:
      "Martin Uttley, a station engineer, takes Anil below Central Station to the cellars, where an old stream still runs under the platforms in a brick tunnel.",
    story: {
      durMs: 2_255_000,
      bracket: "T=0:40 water running in a brick tunnel, trains overhead",
    },
    lines: [
      [
        "answer",
        "There's a stream down here that used to run into the Tolle in the open. They bricked it over and built the station on top.",
      ],
      [
        "state",
        "Above us, the lost property office. Below us, the stream's old channel. I like to think everything ends up somewhere.",
      ],
      [
        "answer",
        "When it rains hard, you can hear it from the platforms if you stand by the clock. Most people think it's the trains.",
      ],
      [
        "state",
        "We found a rowing boat down here once, wedged in an arch. Nobody knows how it got in. It's still there.",
      ],
      [
        "answer",
        "It's cold all year, the same eleven degrees. In the old days the porters kept the station's ice down here, and some of their beer.",
      ],
    ],
  },
  {
    place: "EXT. THE NIGHT MARKET",
    voice: { cue: "MEI", name: "Mei Lockhart" },
    timeOfDay: "NIGHT",
    summary:
      "Mei Lockhart, who runs a noodle stall at the riverside night market, tells Anil how a car park becomes a street every Friday at dusk.",
    story: {
      durMs: 1_755_000,
      bracket: "T=0:35 a crowded market, a wok, a generator humming",
    },
    lines: [
      [
        "answer",
        "At five it's a car park. At six it's a street. At midnight it's a car park again, and you'd never know we'd been.",
      ],
      [
        "state",
        "Every stall has a lamp, and from the bridge the whole riverside looks as if it's been strung with beads.",
      ],
      [
        "answer",
        "My mother started this stall with one burner and a borrowed table. Now I have three burners and the same table.",
      ],
      [
        "state",
        "People come for the food and stay for the river. It's the one night the city remembers it's got one.",
      ],
      [
        "answer",
        "We clear up so well the council once asked if we'd really been. I took that as a compliment.",
      ],
    ],
  },
  {
    place: "EXT. THE OLD FOOTBALL GROUND",
    voice: { cue: "DENNIS", name: "Dennis Akers" },
    timeOfDay: "AFTERNOON",
    summary:
      "Dennis Akers, groundsman at both of the city's football grounds, shows Anil the old riverside pitch that flooded every winter and the new ground that never does.",
    story: {
      durMs: 1_970_000,
      bracket: "T=0:30 a crowd far off, a roller on grass",
    },
    lines: [
      [
        "answer",
        "The old ground was on the river meadow. Every winter it flooded, and every spring we found fish in the goalmouth.",
      ],
      [
        "state",
        "The new ground's up the hill and dry as a bone. Better pitch, less atmosphere. The fish never came to a game there.",
      ],
      [
        "answer",
        "I've cut the grass at both for thirty years. You can tell a ground's mood by how the grass takes a roller.",
      ],
      [
        "state",
        "On a cup night you can hear the crowd from the old ground's gates, a mile off. I still go and stand there.",
      ],
      [
        "answer",
        "The old pitch is allotments now. One fellow grows prize marrows on what used to be the penalty spot.",
      ],
    ],
  },
  {
    place: "INT. THE UNIVERSITY BOATHOUSE",
    voice: { cue: "SUNITA", name: "Sunita Varley" },
    timeOfDay: "MORNING",
    summary:
      "Sunita Varley, boatman at the university boathouse, shows Anil the racks of boats named after old professors, and the first-year crews who are afraid of the water.",
    story: {
      durMs: 1_595_000,
      bracket: "T=0:25 a boat lifted off a rack, shoes on a wooden pontoon",
    },
    lines: [
      [
        "answer",
        "Every boat here is named after a professor who rowed. Some of them are still alive, and they come down to check on their boats.",
      ],
      [
        "state",
        "The new students come down in October thinking rowing is about arms. By November they know it's about legs and lying to yourself.",
      ],
      [
        "answer",
        "I've pulled eleven students out of the Tolle this year. All of them came back the next morning. That's rowers for you.",
      ],
      [
        "state",
        "The boathouse floods to the second rung about once a decade. We hang the boats from the ceiling and wait.",
      ],
      [
        "answer",
        "The best crews aren't the strongest. They're the ones who can keep time when everything hurts.",
      ],
    ],
  },
  {
    place: "INT. THE LAST ROPEWALK",
    voice: { cue: "FRANCIS", name: "Francis Gedge" },
    timeOfDay: "DAY",
    summary:
      "Francis Gedge, the last ropemaker in Lannick, walks Anil the length of a shed a quarter of a mile long, where rope is still made the old way.",
    story: {
      durMs: 2_145_000,
      bracket:
        "T=0:40 hemp twisting, a wheel turning at the far end of a long shed",
    },
    lines: [
      [
        "answer",
        "It's a quarter of a mile long because that's the length of a ship's rope. You walk backwards the whole way, paying out yarn.",
      ],
      [
        "state",
        "There were nine ropewalks on this bank once. Now there's me, two apprentices and a cat who sleeps on the hemp.",
      ],
      [
        "answer",
        "Most of our rope goes to bell towers and old boats. People who want something that will still be there in fifty years.",
      ],
      [
        "state",
        "A good rope sings when you load it. A bad one creaks. You learn to hear the difference before it matters.",
      ],
      [
        "answer",
        "My grandfather walked this shed so many times he worked out he'd been to the sea and back on foot, twice.",
      ],
    ],
  },
  {
    place: "INT. THE FISH HALL",
    voice: { cue: "BRENDA", name: "Brenda Kilbane" },
    timeOfDay: "DAWN",
    summary:
      "Brenda Kilbane, a porter at the fish hall, takes Anil through the four o'clock auction, with the ice, the gulls and the shouting that come with it.",
    story: {
      durMs: 1_805_000,
      bracket: "T=0:40 an auctioneer calling prices, ice tipped onto a floor",
    },
    lines: [
      [
        "answer",
        "Auction's at four, and by six it's all gone. You can sell a whole boat's catch in the time it takes to boil an egg.",
      ],
      [
        "state",
        "The gulls know the timetable better than the porters. They're on the roof by quarter to four, waiting.",
      ],
      [
        "answer",
        "Forty years I've worked here, and I still can't follow the auctioneer. Nobody can. The buyers just nod at the right moment.",
      ],
      [
        "state",
        "We hose the floor down at seven, and by eight there's a dance class in here. The smell never quite goes.",
      ],
      [
        "answer",
        "The best fish never leaves Lannick. The traders keep it back for their own tea, and they'll deny it to your face.",
      ],
    ],
  },
  {
    place: "INT. THE FLOATING CHAPEL",
    voice: { cue: "IRIS", name: "Iris Pennefather" },
    timeOfDay: "EVENING",
    summary:
      "Iris Pennefather keeps the floating chapel moored on the city reach, built for bargemen who could not leave their boats on a Sunday, and rings its bell for Anil.",
    story: {
      durMs: 1_700_000,
      bracket:
        "T=0:30 a small bell on the water, a hull creaking at its moorings",
    },
    lines: [
      [
        "answer",
        "The bargemen couldn't leave their boats, so the church came to them. It's a chapel on a hull, moored where they tied up.",
      ],
      [
        "state",
        "It rises and falls with the tide. In a long sermon you can feel the whole congregation go up a foot.",
      ],
      [
        "answer",
        "We still hold a service once a month. Twelve people, a harmonium and the gulls joining in with the hymns.",
      ],
      [
        "state",
        "The pews are old barge planks. You can still see the tar in the grain, and smell it on a warm day.",
      ],
      [
        "answer",
        "In the great flood it was the only building on the river that came through without a scratch. It simply floated.",
      ],
    ],
  },
  {
    place: "EXT. THE HARBOUR CRANES",
    voice: { cue: "VICTOR", name: "Victor Lenton" },
    timeOfDay: "DAY",
    summary:
      "Victor Lenton, who drove the harbour cranes for twenty-six years, takes Anil up the one crane that was kept, and shows him the city from the cab.",
    story: {
      durMs: 2_015_000,
      bracket: "T=0:30 wind at height, a steel ladder ringing underfoot",
    },
    lines: [
      [
        "answer",
        "Forty metres up, in a cab the size of a wardrobe, eight hours a shift. You learn to bring a flask and a very small sandwich.",
      ],
      [
        "state",
        "From up here you see the whole river, from the weir to the light. Most of the city has never seen it in one piece.",
      ],
      [
        "answer",
        "There were fourteen cranes along this quay. They kept this one because it was the oldest, and the hardest to knock down.",
      ],
      [
        "state",
        "We used to signal each other with our lamps at night. One flash for tea, two for trouble, three for the boss coming.",
      ],
      [
        "answer",
        "On a windy day the cab sways a foot each way. The first week I was sick every shift. After that I slept like a baby.",
      ],
    ],
  },
  {
    place: "INT. CALLOW HOUSE - LOBBY",
    voice: { cue: "ODETTE", name: "Odette Cleary" },
    timeOfDay: "EVENING",
    summary:
      "Odette Cleary, who has lived on the twelfth floor of Callow House since it was built, tells Anil how a tower block by the river became a village stood on its end.",
    story: {
      durMs: 1_740_000,
      bracket: "T=0:25 a lift arriving, doors opening, a radio along a hallway",
    },
    lines: [
      [
        "answer",
        "Fourteen floors, and the river on one side of every flat. We used to say the top floor could see the weather coming.",
      ],
      [
        "state",
        "When it opened, they gave every family a tree for the garden. Mine's the tall one by the bins. It outgrew the block.",
      ],
      [
        "answer",
        "The stairwell is where Callow House really lives. Everybody stops on a landing to talk, and nobody's ever on time.",
      ],
      [
        "state",
        "If the lift goes, the whole block knows in ten minutes. News goes up the stairs faster than anyone can climb them.",
      ],
      [
        "answer",
        "I raised three children here and buried a husband. The view out of my window is the one thing that never changed.",
      ],
    ],
  },
  {
    place: "EXT. THE TURNING REACH",
    voice: { cue: "GRAHAM", name: "Graham Sewell" },
    timeOfDay: "DAY",
    summary:
      "Graham Sewell, who reads the tide gauge below the city, shows Anil the stretch of river where the water stops going out and starts coming in.",
    story: {
      durMs: 1_815_000,
      bracket: "T=0:40 slack water, then the first ripple of the flood tide",
    },
    lines: [
      [
        "answer",
        "At slack water, for about ten minutes, the river doesn't know which way to go. Then a leaf turns round, and the tide's coming in.",
      ],
      [
        "state",
        "The gauge has been read here twice a day for a hundred and forty years. There's only been one week with no entry.",
      ],
      [
        "answer",
        "The one week with no entry was the keeper's own wedding. His brother was meant to cover it, and went to the wedding instead.",
      ],
      [
        "state",
        "Fresh water on top, salt water underneath. Put your hand in deep enough and you can feel where one ends.",
      ],
      [
        "answer",
        "People think a river runs one way. Down here it breathes, in and out, twice a day, like someone asleep.",
      ],
    ],
  },
  {
    place: "EXT. THE MUDFLATS",
    voice: { cue: "ANNETTE", name: "Annette Royle" },
    timeOfDay: "DAWN",
    summary:
      "Annette Royle, warden of the estuary mudflats, takes Anil out at dawn to hear the waders she calls the choir, thousands of birds calling as the tide goes out.",
    story: {
      durMs: 1_630_000,
      bracket: "T=0:50 thousands of wading birds calling over the mudflats",
    },
    lines: [
      [
        "answer",
        "The curlews take the low notes, the redshanks the high ones, and the oystercatchers just shout. Together it sounds like a choir warming up.",
      ],
      [
        "state",
        "Twenty thousand birds on a winter morning, and every one of them has flown here from somewhere colder.",
      ],
      [
        "answer",
        "The mud looks empty, but there's more life in a bucket of it than people in the city. That's what the birds are eating.",
      ],
      [
        "state",
        "Don't walk out there. The mud takes a boot faster than you'd believe, and it doesn't give it back.",
      ],
      [
        "answer",
        "When the tide turns, the whole choir lifts at once. It sounds like applause. I've never got used to it.",
      ],
    ],
  },
  {
    place: "EXT. SALTCOTE - EEL TRAPS",
    voice: { cue: "ELIAS", name: "Elias Thorne" },
    timeOfDay: "NIGHT",
    summary:
      "Elias Thorne, one of the last eel fishers of Saltcote, takes Anil out on a dark night to lift the willow traps his family has set in the same creeks for generations.",
    story: {
      durMs: 2_065_000,
      bracket: "T=0:35 a willow trap lifted out of the water, dripping",
    },
    lines: [
      [
        "answer",
        "You fish eels on the darkest nights. No moon, a bit of rain. They don't like being seen, and neither do eel fishers.",
      ],
      [
        "state",
        "The traps are willow, woven by my uncle. He makes six a winter, and every one lasts longer than he says it will.",
      ],
      [
        "answer",
        "We put most of them back now. There aren't as many as there were, and you don't take the last of anything.",
      ],
      [
        "state",
        "Every creek has a family name. This one's ours. Nobody wrote it down. Everybody in Saltcote just knows.",
      ],
      [
        "answer",
        "An eel swims across an ocean to get here, and then lives in this creek for twenty years. You have to respect that.",
      ],
    ],
  },
  {
    place: "EXT. ARDLE QUAY",
    voice: { cue: "ROSA", name: "Rosa Delahunt" },
    timeOfDay: "MORNING",
    summary:
      "Rosa Delahunt, a deckhand on the car ferry from Ardle Quay, shows Anil how the cars are packed on, and what the crossing to Wrenna Island is like in a westerly.",
    story: {
      durMs: 1_900_000,
      bracket:
        "T=0:45 a ramp chain rattling, a ferry's horn, engines throbbing",
    },
    lines: [
      [
        "answer",
        "We take thirty-two cars if everyone parks the way I tell them, thirty with a caravan, and twenty-nine if the caravan argues.",
      ],
      [
        "state",
        "An hour across in good weather. In a westerly it's an hour and a half, and nobody finishes their tea.",
      ],
      [
        "answer",
        "Half the island's shopping comes over on this boat. You learn who buys what. I could tell you who's having a party.",
      ],
      [
        "state",
        "The ramp chain has to be greased every day or it screams. You'd hear it on the island.",
      ],
      [
        "answer",
        "When the weather turns, the last boat goes early, and the quay fills with people working out where to sleep.",
      ],
    ],
  },
  {
    place: "EXT. THE SHIP GRAVEYARD",
    voice: { cue: "MILES", name: "Miles Haddow" },
    timeOfDay: "AFTERNOON",
    summary:
      "Miles Haddow walks Anil out at low tide among the ribs of old boats left in the estuary mud, and names each one from memory.",
    story: {
      durMs: 2_155_000,
      bracket: "T=0:30 boots in wet mud, water draining out of an old hull",
    },
    lines: [
      [
        "answer",
        "When a boat was finished, they sailed it up on the highest tide and left it. The mud does the rest, slowly.",
      ],
      [
        "state",
        "Thirty-one hulls, and I've given every one a name, because most of their real names have rotted off.",
      ],
      [
        "answer",
        "Some of these were the gravel barges from upriver. They came down full their whole lives and ended up here empty.",
      ],
      [
        "state",
        "At low tide it looks like the skeletons of whales. Children think so, anyway, and I never correct them.",
      ],
      [
        "answer",
        "Every winter one more collapses. You hear it go, a long creak and a soft thump. Then the gulls move in.",
      ],
    ],
  },
  {
    place: "INT. THE CUSTOM HOUSE",
    voice: { cue: "BERNADETTE", name: "Bernadette Coyne" },
    timeOfDay: "DAY",
    summary:
      "Bernadette Coyne, who looks after the old custom house on the quay, shows Anil the long room where every cargo into Lannick was once weighed and written down.",
    story: {
      durMs: 1_775_000,
      bracket:
        "T=0:30 a heavy door, footsteps on a wooden floor, a ledger opened",
    },
    lines: [
      [
        "answer",
        "Every barrel, bale and crate that came into Lannick was weighed in this room and written in a ledger. We have nine hundred of them.",
      ],
      [
        "state",
        "The officers stood at these windows with telescopes, watching for boats that tried to land somewhere quieter.",
      ],
      [
        "answer",
        "The floor slopes because of the weight of the scales. Two hundred years of cargo, and the building leans towards the river.",
      ],
      [
        "state",
        "Someone wrote a love letter in the margin of a ledger, a very long time ago. We never found out if she wrote back.",
      ],
      [
        "answer",
        "On paper, it's still a custom house. Nobody ever closed it. They just stopped coming in.",
      ],
    ],
  },
  {
    place: "INT. GULL POINT LIGHTHOUSE",
    voice: { cue: "ESME", name: "Esme Tull" },
    timeOfDay: "EVENING",
    summary:
      "Esme Tull, who kept the Gull Point light for twenty-two years, climbs the tower with Anil before the museum opens, and tells him what a keeper actually did all night.",
    story: {
      durMs: 2_410_000,
      bracket: "T=0:40 a lens turning, wind against the lantern glass",
    },
    lines: [
      [
        "answer",
        "Twenty-two years I kept it, and then a motor took over. I still have a key. Nobody's asked for it back.",
      ],
      [
        "state",
        "People think a keeper sits and watches the sea. A keeper cleans brass, writes the log and climbs stairs. Mostly stairs.",
      ],
      [
        "answer",
        "On the last night the motor gave out, and the two of us turned the lens by hand until it was light.",
      ],
      [
        "state",
        "I counted those flashes in my sleep for twenty years, and some nights I still do.",
      ],
      [
        "answer",
        "They're opening it as a museum. I'll be the one in the lamp room telling visitors not to touch the glass.",
      ],
    ],
  },
  {
    place: "INT. THE LIFEBOAT HOUSE",
    voice: { cue: "DUNCAN", name: "Duncan Ferraby" },
    timeOfDay: "NIGHT",
    summary:
      "Duncan Ferraby, coxswain of the lifeboat at the mouth of the Tolle, shows Anil the slipway and the pager that has called him out of bed four hundred times.",
    story: {
      durMs: 2_000_000,
      bracket: "T=0:35 a lifeboat sliding down a slipway into the water",
    },
    lines: [
      [
        "answer",
        "Four hundred and six launches in twenty years. I remember the first, the worst and the last, and the rest are weather.",
      ],
      [
        "state",
        "The pager goes, and eight people leave whatever they're doing. They've left dinners, weddings, and once a man left his own birthday.",
      ],
      [
        "answer",
        "From the pager to the water is seven minutes, if the doors behave. The doors usually behave.",
      ],
      [
        "state",
        "Down the slipway the boat hits the water like a dropped plate. Then it's quiet, and you get to work.",
      ],
      [
        "answer",
        "Most rescues aren't dramatic. It's a dinghy with no fuel and two people who are very sorry, very cold and very grateful.",
      ],
    ],
  },
  {
    place: "EXT. WRENNA ISLAND",
    voice: { cue: "ISOBEL", name: "Isobel Kerrow" },
    timeOfDay: "DAY",
    summary:
      "Isobel Kerrow meets Anil off the ferry on Wrenna Island and walks him round the island's one road, which takes an afternoon and every bit of gossip on it.",
    story: {
      durMs: 2_165_000,
      bracket: "T=0:35 wind over short grass, sheep, a gate latch",
    },
    lines: [
      [
        "answer",
        "One road, nine miles, and you'll be stopped by everyone who sees you. It takes an afternoon to walk it, and a week to live it down.",
      ],
      [
        "state",
        "From the top of the island, on a clear day, you can see the light at Gull Point and the whole mouth of the river.",
      ],
      [
        "answer",
        "When the ferry's cancelled, the island just gets on with it. We've got a shop, a school and opinions. That's enough.",
      ],
      [
        "state",
        "Every house keeps a spare bed for whoever's stranded. You'd be surprised who you end up having breakfast with.",
      ],
      [
        "answer",
        "My family's been here eleven generations. We still talk about going over to the mainland as if it's an adventure.",
      ],
    ],
  },
  {
    place: "EXT. THE BAR",
    voice: { cue: "TREVOR", name: "Trevor Blewett" },
    timeOfDay: "DAY",
    summary:
      "Trevor Blewett, a fisherman who has crossed the Bar all his life, explains why a bank of sand at the river mouth decides who goes to sea and when.",
    story: {
      durMs: 1_965_000,
      bracket: "T=0:40 surf breaking on a sandbank, an engine working hard",
    },
    lines: [
      [
        "answer",
        "The Bar is a bank of sand right across the river mouth. You cross it on the tide or not at all. The sea decides, never you.",
      ],
      [
        "state",
        "In a big swell the waves stand up on the Bar like a wall. Boats wait inside for days, crews playing cards.",
      ],
      [
        "answer",
        "It moves. Every storm shifts it a bit. My father's marks don't work any more, and mine won't work for my son.",
      ],
      [
        "state",
        "You learn to read the colour of the water over it. Brown is sand, green is depth, white is going home.",
      ],
      [
        "answer",
        "Every boat that's ever gone out of Lannick has crossed it. So, really, the Bar knows more about this city than anyone.",
      ],
    ],
  },
  {
    place: "EXT. THE SALT PANS",
    voice: { cue: "LOUISA", name: "Louisa Tremlett" },
    timeOfDay: "AFTERNOON",
    summary:
      "Louisa Tremlett has dug out the old salt pans on the edge of the estuary, and shows Anil how sun, wind and a rake turn sea water into salt.",
    story: {
      durMs: 1_680_000,
      bracket: "T=0:30 a wooden rake drawn across a shallow pan of brine",
    },
    lines: [
      [
        "answer",
        "You let the tide into the pans, close the sluice and wait. The sun and wind do the work. I just rake and worry.",
      ],
      [
        "state",
        "There were salt pans here for six hundred years, and then none for sixty. I dug these out of the mud with a spade.",
      ],
      [
        "answer",
        "A good summer gives me a ton. A wet one gives me a bad temper and about a bucket.",
      ],
      [
        "state",
        "The salt tastes of where it came from. Mine has a bit of mud and a lot of estuary, and the cooks love it.",
      ],
      [
        "answer",
        "Some summers the pans turn pink. It's tiny creatures in the brine. Visitors think I've added something. I haven't.",
      ],
    ],
  },
  {
    place: "INT. THE LIGHTSHIP",
    voice: { cue: "ALFRED", name: "Alfred Nancarrow" },
    timeOfDay: "DAY",
    summary:
      "Alfred Nancarrow, who served on the lightship that marked the channel outside the Bar, shows Anil round the red hull now moored in the old dock.",
    story: {
      durMs: 1_850_000,
      bracket: "T=0:30 a hull creaking, a hatch opening, water against steel",
    },
    lines: [
      [
        "answer",
        "A lighthouse that floats, with no engine. They towed us out and anchored us, and we stayed a month at a time.",
      ],
      [
        "state",
        "Seven men, one cook and a light on a mast. We played the same card game for four years and never finished it.",
      ],
      [
        "answer",
        "In a gale she rolled so far you could walk up the wall. You slept wedged in with your boots on.",
      ],
      [
        "state",
        "She's painted red so ships could see her by day. Now she's red so visitors can find her in the dock.",
      ],
      [
        "answer",
        "The worst part was the quiet in fog. Just the horn every thirty seconds, and you counting between them.",
      ],
    ],
  },
  {
    place: "EXT. SALTCOTE CREEK",
    voice: { cue: "CONSTANCE", name: "Constance Hebble" },
    timeOfDay: "EVENING",
    summary:
      "Constance Hebble, the local historian of Saltcote, walks Anil along the creek and takes apart every smuggling story the pubs tell, nearly.",
    story: {
      durMs: 2_070_000,
      bracket: "T=0:30 a creek at dusk, a pub door opening on laughter",
    },
    lines: [
      [
        "answer",
        "Every pub on this coast has a smugglers' tunnel. I've checked them all. Three are cellars, one is a drain and one is a wardrobe.",
      ],
      [
        "state",
        "There was smuggling here, but it was mostly tea and a few barrels, done by tired farmers. Nobody wore an eye patch.",
      ],
      [
        "answer",
        "The best story is true. A whole cargo of lace hidden in a church, under the vicar's nose, with the vicar's help.",
      ],
      [
        "state",
        "The stories grow a little every time someone buys a round. I've heard one tunnel get two miles longer in a night.",
      ],
      [
        "answer",
        "I don't mind the exaggerating. Somebody has to keep a place interesting, and the truth is often just weather and paperwork.",
      ],
    ],
  },
  {
    place: "EXT. THE SEAL BANK",
    voice: { cue: "TAMARA", name: "Tamara Okoro" },
    timeOfDay: "MORNING",
    summary:
      "Tamara Okoro, who leads the yearly seal count, takes Anil out by boat to the sandbank where the seals haul out, and they count together.",
    story: {
      durMs: 1_645_000,
      bracket: "T=0:40 seals calling across the water, an outboard idling",
    },
    lines: [
      [
        "answer",
        "Two hundred and forty-one last year. We count from the boat, twice, and if the numbers don't match we count again.",
      ],
      [
        "state",
        "Seals hate being counted. The moment you get to a hundred, half of them slide into the water and come up somewhere else.",
      ],
      [
        "answer",
        "They haul out on the bank at low tide to rest. They look lazy. They've swum further this morning than I'll walk all week.",
      ],
      [
        "state",
        "Every seal has a face you can learn. There's one we call the alderman, who sits at the top of the bank as if he owns it.",
      ],
      [
        "answer",
        "The numbers are up every year. Cleaner water, more fish. The river's been quietly telling everyone it's better.",
      ],
    ],
  },
  {
    place: "EXT. THE STORM WALL",
    voice: { cue: "GEOFFREY", name: "Geoffrey Lusk" },
    timeOfDay: "NIGHT",
    summary:
      "Geoffrey Lusk, who helped build the storm wall along the estuary, walks it with Anil on a rough night and explains what it keeps out.",
    story: {
      durMs: 1_875_000,
      bracket: "T=0:40 waves hitting a sea wall, spray falling on concrete",
    },
    lines: [
      [
        "answer",
        "Two miles of concrete, and every metre of it is there because of one night when the sea came into the town.",
      ],
      [
        "state",
        "On a rough night the spray comes over the top and lands on the road like gravel. The wall takes the rest.",
      ],
      [
        "answer",
        "I poured the footings for this section when I was nineteen. My initials are in it, under the third lamp post.",
      ],
      [
        "state",
        "People walk their dogs along the top and never think about it. That's what a good wall wants. To be forgotten.",
      ],
      [
        "answer",
        "The sea's patient. It tests the wall every tide, looking for one bad joint. We check them every spring.",
      ],
    ],
  },
  {
    place: "INT. THE FOG SIGNAL STATION",
    voice: { cue: "MABEL", name: "Mabel Kitto" },
    timeOfDay: "DAY",
    summary:
      "Mabel Kitto, whose family lived beside the fog signal on the point, sounds the old horn for Anil one last time before it is sealed up.",
    story: {
      durMs: 1_780_000,
      bracket: "T=0:30 a deep fog horn sounding twice",
    },
    lines: [
      [
        "answer",
        "Two blasts every minute in fog, and the whole town knew it. Children slept through it. Visitors didn't.",
      ],
      [
        "state",
        "When the fog came in, my father started the engine and didn't sleep till it lifted. Once that was four days.",
      ],
      [
        "answer",
        "You don't hear it with your ears so much as your chest. Stand close and it moves your coat.",
      ],
      [
        "state",
        "Fishermen used to say the horn sounded like a cow that had lost its calf. They meant it kindly.",
      ],
      [
        "answer",
        "The last time it sounded for real, the whole town came out onto the front, in the fog, to listen.",
      ],
    ],
  },
  {
    place: "EXT. THE PILOT CUTTER",
    voice: { cue: "CORMAC", name: "Cormac Dunphy" },
    timeOfDay: "DAWN",
    summary:
      "Cormac Dunphy, a river pilot, takes Anil out on the cutter at dawn to meet a cargo ship outside the Bar, and climbs aboard it on a rope ladder.",
    story: {
      durMs: 1_980_000,
      bracket:
        "T=0:45 a cutter's engine, a ship's hull alongside, a rope ladder knocking",
    },
    lines: [
      [
        "answer",
        "Every big ship coming into the Tolle has to take a pilot. A captain knows the sea. We know this river, which is not the same thing.",
      ],
      [
        "state",
        "The ladder hangs down the side of the ship, and the cutter rises and falls under it. You step off at the top of a wave.",
      ],
      [
        "answer",
        "Eighteen years and I've never fallen in. I've come close twice, and I bought a round both times.",
      ],
      [
        "state",
        "Once aboard, you're the most important person on the bridge for three hours. Then you're just a man on a ladder again.",
      ],
      [
        "answer",
        "The river changes every week. Sand moves, a buoy drags. Nothing written down is ever quite up to date.",
      ],
    ],
  },
  {
    place: "EXT. THE BAR SANDS",
    voice: { cue: "BETH", name: "Beth Ansty" },
    timeOfDay: "DAWN",
    summary:
      "Beth Ansty walks Anil out across the Bar at the lowest tide of the year, when the sandbank that turns back ships is somewhere you can stand.",
    story: {
      durMs: 1_890_000,
      bracket: "T=0:40 wet sand underfoot, the sea a long way off",
    },
    lines: [
      [
        "answer",
        "Twice a year the tide goes out far enough that you can walk on the Bar. You get two hours, and you watch the clock the whole time.",
      ],
      [
        "state",
        "We go out for cockles, a dozen of us with rakes, and the sea's a mile away. It feels like standing on the floor of the world.",
      ],
      [
        "answer",
        "The rule is simple. When the first one turns for home, everyone turns. Nobody argues on the Bar.",
      ],
      [
        "state",
        "You find things out there. Bottles, an anchor once, a ship's bell with no ship. The sand gives up what it likes.",
      ],
      [
        "answer",
        "My grandmother walked it, and her mother. We've all got the same habit of looking back over our shoulders.",
      ],
    ],
  },
  {
    place: "EXT. BEYOND GULL POINT",
    voice: { cue: "KIT", name: "Kit Pengelly" },
    timeOfDay: "NIGHT",
    summary:
      "Kit Pengelly takes Anil out past the Gull Point light at night, to where the river's colour runs out into the sea and the city is a glow behind them.",
    story: {
      durMs: 1_330_000,
      bracket:
        "T=0:35 a small boat at sea at night, the lighthouse flashing far behind",
    },
    lines: [
      [
        "answer",
        "Out here you can see the river's water on top of the sea for a mile. Brown on green, until it gives up and joins in.",
      ],
      [
        "state",
        "The light behind you, two flashes, then dark. You start to feel it as a heartbeat, the city's or your own.",
      ],
      [
        "answer",
        "I fish out here because nobody else wants to. The fish don't mind the dark, and neither do I, most nights.",
      ],
      [
        "state",
        "Look back and the whole of Lannick is a glow on the clouds. All those people, and not one of them can see you.",
      ],
      [
        "answer",
        "My dad said past the light is where the river stops being yours. After that you're a guest, and you behave.",
      ],
    ],
  },
  {
    place: "EXT. THE OPEN SEA",
    voice: { cue: "NAOMI", name: "Naomi Fairweather" },
    timeOfDay: "DAY",
    summary:
      "Naomi Fairweather, mate of a cargo ship heading out, tells Anil where the water of the Tolle goes when it reaches the sea, and why sailors still look back.",
    story: null,
    lines: [
      [
        "answer",
        "The water from Harrow Fell ends up somewhere out here. A drop of it might be off another coast by next year.",
      ],
      [
        "state",
        "Every sailor looks back at the last light. Nobody admits it, and everybody does it.",
      ],
      [
        "answer",
        "Sixty places from the spring to here. The sea doesn't care about any of them, and that's why you need the river to.",
      ],
      [
        "state",
        "On a ship you lose the sound of water moving past. It's everywhere, so you stop hearing it.",
      ],
      [
        "answer",
        "When I come home, I know I'm close when the sea goes brown. That's the Tolle, saying hello.",
      ],
    ],
  },
];

/** Lines the host or the episode's voice may say anywhere on the river. */
const ANYONE: readonly Line[] = [
  ["ask", "How long have you known this place?"],
  ["ask", "Who showed it to you first?"],
  ["ask", "What does it sound like in the middle of winter?"],
  ["ask", "Is it always this quiet, or have we been lucky?"],
  ["ask", "Do you ever get tired of the river?"],
  ["ask", "What would you want a stranger to notice here?"],
  ["ask", "Can you remember the first time you came down here?"],
  ["ask", "Has it changed much since you were young?"],
  ["ask", "What do people get wrong about it?"],
  ["ask", "Where would you stand, if you only had one minute here?"],
  ["ask", "Who else remembers it the way you do?"],
  ["ask", "What's the oldest thing you can see from here?"],
  ["ask", "Does the river have a smell here, would you say?"],
  ["ask", "What happens here when nobody's watching?"],
  [
    "ask",
    "Is there a story here that everybody tells, and a true one that nobody does?",
  ],
  ["ask", "How high does the water come in a bad year?"],
  ["ask", "Would you ever leave?"],
  ["ask", "What did your family do here, before you?"],
  ["ask", "Is there a word for this that only people round here use?"],
  ["ask", "What's the best time of day to be here?"],
  ["ask", "When did you last see somebody new find it?"],
  ["ask", "Do the children who grow up here care about it?"],
  ["ask", "What would be lost if this went tomorrow?"],
  ["ask", "Who looks after it now?"],
  ["ask", "Is there a sound here you'd miss most?"],
  ["ask", "How do you know when the weather's about to turn?"],
  ["ask", "What do you carry with you when you come down here?"],
  ["ask", "Did anyone ever write any of this down?"],
  ["ask", "Have you ever been frightened here?"],
  ["ask", "What's here that isn't on any map?"],
  ["ask", "Could you find your way here in the dark?"],
  ["ask", "Which season shows it best?"],
  ["ask", "What's the strangest thing the river's brought you?"],
  ["ask", "Do you talk to it, the river?"],
  ["ask", "Is it the same river your grandparents knew?"],
  ["ask", "Who would you bring here, if you could bring anyone?"],
  ["ask", "What keeps you coming back?"],
  ["ask", "What do visitors always ask you?"],
  ["ask", "Did you ever think you'd still be here?"],
  ["ask", "How far is the sea from here, would you guess?"],
  ["ask", "Is there anything here you've never told anybody?"],
  ["ask", "What would you call this place, if it had no name?"],
  ["ask", "When does it look its worst?"],
  ["ask", "Is the river kind here, or just quiet?"],
  ["ask", "What's the one thing I should listen for?"],
  ["state", "Listen to that. You'd pay for a sound like that in a city."],
  [
    "state",
    "I've walked past here a hundred times and never once looked properly.",
  ],
  [
    "state",
    "Everybody round here has a story about this spot, and every one is different.",
  ],
  ["state", "You can feel the river before you see it. The air goes cool."],
  [
    "state",
    "There's always one more thing to notice, if you stand still long enough.",
  ],
  ["state", "Give it a minute. It's shy with strangers."],
  ["state", "My notes are soaked. I'll remember this bit anyway."],
  [
    "state",
    "That's the thing about a river. It's never the same water twice, and it never stops trying.",
  ],
  ["state", "People pass this every day without knowing what it is."],
  ["state", "It smells of mud and rain and something older."],
  ["state", "I'd like to come back in winter and hear it again."],
  ["state", "Somebody should put up a sign. Then again, perhaps not."],
  ["state", "The light's going. We've got about ten minutes."],
  ["state", "You'd never guess how much happened in a place this small."],
  [
    "state",
    "There's a heron watching us from the far bank, like an inspector.",
  ],
  [
    "state",
    "Every place on this river has its keeper, and they always know each other.",
  ],
  ["state", "That's the best answer I've had all week."],
  ["state", "It's colder than it looked from the road."],
  ["state", "I didn't expect to like it this much."],
  ["state", "Water remembers everything. That's what my teacher used to say."],
  ["state", "We should be quiet for a moment and just listen."],
  ["state", "There's mud on my boots that's older than the city."],
  ["state", "Most of the river's stories are about somebody getting wet."],
  ["state", "It's easy to forget there's a whole river behind the streets."],
  ["state", "The birds were here first, and they'd like us to know it."],
  ["state", "I can hear a tractor somewhere, and nothing else at all."],
  ["state", "A place like this needs someone to remember it out loud."],
  ["state", "Hold on, the wind's got into the microphone."],
  ["state", "I'll never hear the name of this place the same way again."],
  ["state", "It's not grand. It doesn't need to be."],
  ["state", "You can see where the water's been, if you know where to look."],
  ["state", "Everything here has been mended at least once."],
  [
    "state",
    "There's a bench over there with somebody's name on it, facing the water.",
  ],
  ["state", "It's quieter than I imagined, and louder than it looks."],
  ["state", "That's the first time today the sun's come out."],
  ["state", "Somebody's left a bunch of flowers on the wall. Fresh ones."],
  [
    "state",
    "The river doesn't care about any of us, and somehow that's a comfort.",
  ],
  ["state", "I'm going to have to come back with better shoes."],
  [
    "state",
    "Half the city has no idea this is here, and the other half wants to keep it that way.",
  ],
  ["state", "Even the gulls seem to slow down here."],
  ["state", "I wish I'd brought a flask."],
  ["state", "Stand here and you can see three centuries at once."],
  [
    "state",
    "There's a dog on the far bank that's been barking at us since we arrived.",
  ],
  ["state", "That's a story I'll be telling for a while."],
  ["state", "You can tell how deep it is by how slowly it moves."],
  ["state", "Nobody plans to love a place like this. It just happens."],
  ["state", "Every bit of this was somebody's whole life once."],
  ["state", "The rain's coming. You can see it walking up the river."],
  ["state", "I think the river likes being visited."],
  ["state", "Some places you have to be told about. This one you find."],
  ["state", "It's the kind of quiet you only get near moving water."],
  ["state", "That's the church clock from the next village, I think."],
  ["state", "I've got sand in places I didn't know I had."],
  ["state", "If you sat here long enough, the whole world would walk past."],
  [
    "state",
    "Almost nobody comes here on purpose, and everybody's glad they did.",
  ],
];

const toEntry =
  (speaker: string | null) =>
  ([intent, text]: Line): DialogueEntry => ({ speaker, intent, text });

export const DOWN_THE_TOLLE_GUIDE: StyleGuide = Object.freeze<StyleGuide>({
  project: "down-the-tolle",
  format: "variety",
  cast: [HOST, ...EPISODES.map((episode) => episode.voice)],
  places: EPISODES.map((episode) => episode.place),
  names: ["Lannick"],
  vocabulary: [
    "weir",
    "lock",
    "ford",
    "towpath",
    "sluice",
    "tide",
    "slack water",
    "flood tide",
    "ebb",
    "estuary",
    "mudflat",
    "sandbank",
    "reach",
    "creek",
    "bank",
    "upriver",
    "downriver",
    "mooring",
    "slipway",
    "quay",
  ],
  beats: EPISODES.map((episode, index) => ({
    id: `heavy/h32/ep${index + 1}#1`,
    scenes: [1, 1],
    pages: [
      1,
      episode.story === null
        ? 1
        : Math.round(episode.story.durMs / SPOKEN_MS_PER_PAGE),
    ],
    timeOfDay: episode.timeOfDay,
    places: [episode.place],
    cast: [HOST.cue, episode.voice.cue],
    summary: episode.summary,
  })),
  style: { actionWords: 0, dialogueWords: 30, sentenceWords: 0, banned: [] },
  action: [],
  dialogue: [
    ...EPISODES.flatMap((episode) =>
      episode.lines.map(toEntry(episode.voice.cue)),
    ),
    ...ANYONE.map(toEntry(null)),
  ],
  tags: [
    "as the old boys on the bank say",
    "if the river lets you",
    "give or take a tide",
    "so my grandmother always said",
    "on a good day for it",
    "or so they tell me up here",
    "if you believe the pub",
    "rain or shine",
    "in a dry summer anyway",
    "if you ask anyone local",
    "at least on this stretch",
    "and that's the river's own truth",
    "give or take a bend",
    "if the wind's in the west",
    "word for word, as it was told to me",
    "or near enough for the river",
    "for what that's worth down here",
    "as far as anyone remembers",
    "when the water's low",
    "if I'm being honest with you",
    "and nobody argues with that",
    "which tells you something",
    "so the story goes",
    "according to my father",
    "in my experience of it",
    "and the river knows it",
    "whatever the council says",
    "if you're patient",
    "as long as I've known it",
    "on this side of the water",
    "and I'd swear to it",
    "you'll find",
    "if the tide's with you",
    "believe it or not",
    "most years",
    "since before my time",
    "and that's not nothing",
    "between you and the river",
    "if you listen for it",
    "as sure as the tide",
  ],
  stories: EPISODES.flatMap((episode, index) =>
    episode.story === null
      ? []
      : [
          {
            slug: `ep${index + 1}`,
            durMs: episode.story.durMs,
            lines: [],
            brackets: [episode.story.bracket],
          },
        ],
  ),
  barks: [],
});
