// The phrase bank of Lannick One News, in the voice of the newsroom: tonight's scripted stories, read by its presenters and their guests.
import type { StyleGuide } from "../../guide.ts";

export const NEWS_GUIDE: StyleGuide = Object.freeze<StyleGuide>({
  project: "lannick-one-news",
  format: "variety",
  cast: [
    { cue: "GRACE", name: "Grace Adjei" },
    { cue: "GRACE (V.O.)", name: "Grace Adjei" },
    { cue: "OWEN", name: "Owen Tallis" },
    { cue: "OWEN (V.O.)", name: "Owen Tallis" },
    { cue: "PETRA", name: "Petra Lund" },
    { cue: "PETRA (V.O.)", name: "Petra Lund" },
    { cue: "KEMI", name: "Kemi Adewale" },
    { cue: "KEMI (V.O.)", name: "Kemi Adewale" },
    { cue: "KOJO", name: "Kojo Danso" },
    { cue: "KOJO (V.O.)", name: "Kojo Danso" },
    { cue: "MARGARET PELL", name: "Cllr Margaret Pell" },
    { cue: "HALIMA SARR", name: "Dr. Halima Sarr" },
    { cue: "DEV ANSARI", name: "Dev Ansari" },
    { cue: "WOMAN WITH A PRAM", name: "Woman with a pram" },
    { cue: "MAN AT THE TRAM STOP", name: "Man at the tram stop" },
    { cue: "STUDENT", name: "Student" },
    { cue: "RETIRED POSTMAN", name: "Retired postman" },
    { cue: "MOIRA TEALE", name: "Moira Teale" },
    { cue: "BARNEY COYLE", name: "Barney Coyle" },
    { cue: "INES VARGA", name: "Ines Varga" },
    { cue: "YUSUF KELL", name: "Yusuf Kell" },
    { cue: "LIESL DUNMORE", name: "Liesl Dunmore" },
    { cue: "JOAN HEBDITCH", name: "Joan Hebditch" },
    { cue: "FEMI LAWAL", name: "Femi Lawal" },
    { cue: "TOBIAS FERRO", name: "Dr. Tobias Ferro" },
    { cue: "OONA STRAND", name: "Oona Strand" },
    { cue: "KIERAN FALLOW", name: "Kieran Fallow" },
    { cue: "SUPPORTER", name: "Supporter" },
  ],
  places: [],
  names: [
    "Lannick",
    "Lannick One News",
    "Tolle",
    "Tolle Exchange",
    "Tolle Bridge",
    "Mercer Street",
    "Exchange Square",
    "Halse Road",
    "Halse Park",
    "Halse Park Primary",
    "Halse Bridge",
    "Ardle",
    "Ardle Quay",
    "Wrenna Island",
    "Gull Point",
    "Linnet Street",
    "Lannick General",
    "Coast line",
    "University of Lannick",
    "Kittiwake-1",
    "Kittiwake-2",
    "Earth",
    "Lannick Philharmonic",
    "Lannick Athletic",
    "Port Allard",
    "Harrowfield Town",
    "Tolle Valley Herons",
    "Gita Ramsden",
    "Lena Morrow",
    "Rob Kinsella",
    "Carys Lloyd",
  ],
  vocabulary: [],
  beats: [],
  style: {
    actionWords: 0,
    dialogueWords: 25,
    sentenceWords: 20,
    banned: [
      /\b(shocking|amazing|tragic|disgraceful|brilliant|outrageous|stunning|horrific|incredible|terrible|wonderful)\b/i,
    ],
  },
  action: [],
  dialogue: [],
  tags: [],
  stories: [
    {
      slug: "stories/02",
      durMs: 35_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The vote means the library on Mercer Street will close once the Tolle Exchange is ready, in about three years.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The council says the Mercer Street building will then be sold, and the money will pay for most of the conversion.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The city librarian, Gita Ramsden, says no books, staff or opening hours will be lost in the move.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "Any group that meets at Mercer Street will be offered a room in the new building.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/03",
      durMs: 65_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "Exchange Square is a few steps from the old Exchange building. This afternoon we asked people there what they made of the decision.",
        },
        {
          speaker: "WOMAN WITH A PRAM",
          intent: "state",
          text: "I took my eldest to Mercer Street every week. If the new one has a proper children's floor, I'll walk the extra ten minutes.",
        },
        {
          speaker: "MAN AT THE TRAM STOP",
          intent: "state",
          text: "It's been empty since I was at school. Anything that puts the lights back on in there is fine by me.",
        },
        {
          speaker: "STUDENT",
          intent: "state",
          text: "I just want somewhere quiet to work that's open late. We haven't been told the hours yet.",
        },
        {
          speaker: "RETIRED POSTMAN",
          intent: "state",
          text: "Three years is a long time. I'll believe it when I'm sitting in there with a newspaper.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The council says opening hours will be part of next week's consultation.",
        },
      ],
      brackets: ["T=0:10 the square at lunchtime, with the Exchange behind"],
    },
    {
      slug: "stories/04",
      durMs: 40_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "The tram line 3 extension to Halse Park carried just over thirty-eight thousand passengers in its first week, the operator says.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The busiest day was the opening day, with seven thousand two hundred journeys. The operator had planned for thirty thousand a week.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The council says it will publish figures for the whole line each month.",
        },
      ],
      brackets: [
        "T=0:12 graphic: daily passengers on the Halse Park extension",
      ],
    },
    {
      slug: "stories/05",
      durMs: 30_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "The roadworks on Halse Road will last two weeks longer than planned. The water company says it has found a second pipe that needs replacing.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "One lane will stay closed between the tram depot and the Halse Park junction, with temporary lights at both ends.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Buses on route forty are diverted until the work is finished, the council says.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/06",
      durMs: 45_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Tolle Bridge will close to traffic overnight for four nights from a week tomorrow, while its road surface is replaced.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The bridge will be shut from ten at night until five in the morning. People on foot can still use the north footway.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Drivers will be sent over Halse Bridge instead. The council says the last trams across will run ten minutes earlier on those nights.",
        },
      ],
      brackets: ["T=0:12 graphic: the closure times and the signed diversion"],
    },
    {
      slug: "stories/08",
      durMs: 30_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "On the roads, the wind is expected to be strongest on the coast road between Ardle and Gull Point after nine o'clock.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The police are asking drivers of high-sided vehicles to keep off the coast road until the morning.",
        },
      ],
      brackets: ["T=0:11 graphic: the roads most exposed to the wind tonight"],
    },
    {
      slug: "stories/09",
      durMs: 35_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "On Ardle Quay, flood boards are going up ahead of tonight's high tide.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "Harbour staff began fixing the boards across the doorways of the quayside shops at four this afternoon.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "The harbourmaster, Captain Lena Morrow, warned yesterday that the wind and a spring tide could push water over the quay wall.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "High tide is at eleven minutes past eleven.",
        },
      ],
      brackets: ["T=0:05 boards being bolted into place"],
    },
    {
      slug: "stories/10",
      durMs: 40_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "Car park charges at Lannick General are to be reviewed, the hospital has said.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "A patients' group asked for the review four days ago. It says visitors often pay for a whole day to park for an hour.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The hospital says the review will look at a cheaper evening rate, and free parking for families visiting the children's ward.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "Charges have not changed in six years, the patients' group says. The hospital expects to publish what it finds in the spring.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/11",
      durMs: 110_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "Twelve primary schools in Lannick have started serving a new school meals menu this week, as part of a trial announced by the council.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "Pupils helped to choose the dishes. Kemi Adewale went to lunch at one of the schools.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "At Halse Park Primary, lunch is at twelve. Today it is fish pie, a lentil soup, or both.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The new menu has fewer puddings, more vegetables and a soup every day. The schools say it costs the same to make.",
        },
        {
          speaker: "MOIRA TEALE",
          intent: "state",
          text: "We gave the children three menus to taste last term. This is the one they voted for, so they can't complain.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The kitchen staff had two days of training before the trial began.",
        },
        {
          speaker: "BARNEY COYLE",
          intent: "state",
          text: "The soup's the thing. We make it from scratch at half seven, and by quarter to one there's nothing left in the pot.",
        },
        {
          speaker: "KEMI",
          intent: "ask",
          text: "Is there anything the children asked for that didn't make it on to the menu?",
        },
        {
          speaker: "BARNEY COYLE",
          intent: "answer",
          text: "They wanted chips every day. We said once a week.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The council will ask parents and pupils what they think at the end of term, before deciding whether to offer the menu in every primary.",
        },
        {
          speaker: "KEMI",
          intent: "state",
          text: "Kemi Adewale, Lannick One News, Halse Park.",
        },
      ],
      brackets: [
        "T=0:10 the dinner hall at Halse Park Primary",
        "T=0:11 pupils queueing at the serving hatch",
      ],
    },
    {
      slug: "stories/12",
      durMs: 30_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "The company that runs Lannick's buses has apologised after its timetable app stopped working for most of the morning.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "It says a fault in an update left journeys unplanned and arrival times missing from stop displays until just after midday.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The company says the fault is fixed, and anyone who bought a day ticket in the app this morning will get a refund.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/13",
      durMs: 55_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Forty new tram drivers will begin training at the Halse Road depot next week, the largest intake the network has taken on in a decade.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "The operator says the drivers are needed for the line 3 extension and for later services on the other lines.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "Training lasts eleven weeks, including a fortnight of night driving with an instructor beside them.",
        },
        {
          speaker: "INES VARGA",
          intent: "state",
          text: "Most of this intake have never driven anything bigger than a car. By the end, they'll know every set of points on the network.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The first of the new drivers should be carrying passengers by the spring.",
        },
      ],
      brackets: ["T=0:06 a tram leaving the depot"],
    },
    {
      slug: "stories/14",
      durMs: 25_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Work to replace a water main under Linnet Street begins on the first of next month and is expected to take six weeks.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The water company says the street will stay open, but parking on the south side will be suspended while it digs.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Buses on route twelve are not affected.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/15",
      durMs: 100_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "Lannick's first night market opens tomorrow evening on Exchange Square, two days after its licence was approved.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "More than sixty traders have taken pitches. Petra Lund watched the stalls go up.",
        },
        {
          speaker: "PETRA (V.O.)",
          intent: "state",
          text: "By four this afternoon, the first rows of stalls were standing on the square, each with a striped roof and a number.",
        },
        {
          speaker: "PETRA (V.O.)",
          intent: "state",
          text: "The market will open from five until eleven on three evenings a week, until the end of the year.",
        },
        {
          speaker: "YUSUF KELL",
          intent: "state",
          text: "We wanted somewhere people could come after work and stay. Food, music, a few things to buy, and lights strung across the whole square.",
        },
        {
          speaker: "PETRA (V.O.)",
          intent: "state",
          text: "Under the licence, music must stop at ten, and the square must be clear by midnight.",
        },
        {
          speaker: "LIESL DUNMORE",
          intent: "state",
          text: "I've done markets on the coast for twelve years. This is the first time I've been able to get the tram home afterwards.",
        },
        {
          speaker: "PETRA",
          intent: "ask",
          text: "What happens if the gale is still blowing tomorrow?",
        },
        {
          speaker: "YUSUF KELL",
          intent: "answer",
          text: "The forecast says it'll have passed by the afternoon. If it hasn't, the roofs come down and we open the next night.",
        },
        {
          speaker: "PETRA",
          intent: "state",
          text: "Petra Lund, Lannick One News, on Exchange Square.",
        },
      ],
      brackets: [
        "T=0:08 frames of the stalls being bolted together",
        "T=0:07 a stallholder testing a string of lights",
      ],
    },
    {
      slug: "stories/16",
      durMs: 40_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The lighthouse museum at Gull Point will reopen the day after tomorrow, after almost two years of restoration.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "Work on the tower and the keeper's cottage was finished five days ago. The lantern room has been repainted and its brass cleaned.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "For the first time since the museum closed, visitors can climb to the gallery. It will cost nothing to get in for the first month.",
        },
      ],
      brackets: ["T=0:08 the lens turning at the top of the tower"],
    },
    {
      slug: "stories/17",
      durMs: 25_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "The fish market on Ardle Quay will open an hour later from next month, at five in the morning instead of four.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The harbour board says fewer boats now land before dawn, and most buyers arrive after five.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Traders will be asked how the change is working after six months.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/18",
      durMs: 45_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The council's planning committee has approved a hundred and forty homes on the site of the old dye works.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "A third of the homes will be for social rent. The developer must also build a footpath along the river and a small park.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The site has been empty for nineteen years. Building could begin next summer, the council says.",
        },
      ],
      brackets: ["T=0:17 graphic: the site plan beside the river"],
    },
    {
      slug: "stories/19",
      durMs: 30_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "There will be no trains between Lannick and Ardle on the Coast line for four days next week while engineers replace a bridge deck.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Buses will replace trains at every station. The rail operator says journeys will take about twenty minutes longer.",
        },
      ],
      brackets: ["T=0:08 graphic: the stations served by buses"],
    },
    {
      slug: "stories/20",
      durMs: 105_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The animal shelter at Halse Park is asking for foster homes, after taking in more animals this year than ever before.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "Kemi Adewale has been to meet some of them.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The shelter has room for forty dogs and sixty cats. Tonight it is caring for fifty-two dogs and seventy-one cats.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "Some are sharing kennels, and the staff room has become a nursery for kittens.",
        },
        {
          speaker: "JOAN HEBDITCH",
          intent: "state",
          text: "Foster care isn't for ever. A few weeks on a sofa gives an animal a rest from the noise, and gives us a pen back.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "Foster carers are given food, bedding and vet care, and a member of staff they can call at any hour.",
        },
        {
          speaker: "FEMI LAWAL",
          intent: "state",
          text: "Six dogs have come through our house this year. You do get attached. That's rather the point.",
        },
        {
          speaker: "KEMI",
          intent: "ask",
          text: "Who can apply?",
        },
        {
          speaker: "JOAN HEBDITCH",
          intent: "answer",
          text: "Anyone over eighteen with a bit of space and some patience. We match the animal to the home.",
        },
        {
          speaker: "KEMI",
          intent: "state",
          text: "Kemi Adewale, Lannick One News, at the Halse Park shelter.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The shelter asks anyone who can help to apply through its website rather than by phone. The address is on our website.",
        },
      ],
      brackets: [
        "T=0:13 dogs in the kennel run",
        "T=0:09 kittens asleep in a laundry basket",
      ],
    },
    {
      slug: "stories/21",
      durMs: 50_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "New rules for renting electric scooters come into force across the country today.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "Anyone renting one must now be eighteen or over and hold a driving licence, and hire companies must check both before the first ride.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "Scooters will be limited to twelve miles an hour, and companies must collect any left blocking a pavement within two hours.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "The government says the rules follow two years of trials in twenty towns and cities, Lannick among them.",
        },
      ],
      brackets: ["T=0:12 scooters parked in a marked bay"],
    },
    {
      slug: "stories/22",
      durMs: 45_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "A national review of rail fares has been published. It recommends one daily price cap, whichever operator runs the train.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "It also proposes ending peak fares on weekend mornings, and cheaper tickets for anyone who travels more than three days a week.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The government says it will respond to the review in the new year.",
        },
      ],
      brackets: ["T=0:17 graphic: what the review recommends"],
    },
    {
      slug: "stories/23",
      durMs: 35_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The national apprenticeship scheme has had more applications this year than in any year since it began, figures published today show.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "More than two hundred thousand people applied. The most popular choices were engineering and nursing, followed by building trades.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "In Lannick, the college says it has filled every apprenticeship place it offers for next year, and has a waiting list.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/24",
      durMs: 35_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "New waymarks have been put up along the coastal path, so walkers can follow it from end to end for the first time.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "The oak posts are carved with a gull and the distance to the next village.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "A team of volunteers fitted more than three hundred of them.",
        },
      ],
      brackets: ["T=0:13 walkers passing a new post above the cliffs"],
    },
    {
      slug: "stories/25",
      durMs: 115_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "Lannick is now the fourth-fastest-growing city in the country, according to census figures published today.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "The city's population has grown by nine per cent in ten years, to just over four hundred and twelve thousand.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "Most of that growth is among people in their twenties and thirties, many of them moving for work at the port and the university.",
        },
        {
          speaker: "TOBIAS FERRO",
          intent: "state",
          text: "Lannick used to lose its graduates within a year. Now a lot of them stay, and some who left are coming back with children.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "The figures also show more people living in the city centre, where the number of homes has nearly doubled.",
        },
        {
          speaker: "MARGARET PELL",
          intent: "state",
          text: "A growing city means pressure on schools, on buses, on doctors' surgeries. We have to plan for all three now, not later.",
        },
        {
          speaker: "GRACE",
          intent: "ask",
          text: "Is the city building enough homes to keep up?",
        },
        {
          speaker: "MARGARET PELL",
          intent: "answer",
          text: "Not yet. That's why approvals like the dye works matter, and why we want more homes above the shops in the centre.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "The census also finds the city's average age has fallen for the first time in thirty years, to thirty-eight.",
        },
      ],
      brackets: [
        "T=0:18 graphic: the city's population over thirty years",
        "T=0:11 commuters crossing Tolle Bridge in the morning",
      ],
    },
    {
      slug: "stories/26",
      durMs: 25_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Gale warnings are in force along the whole north coast tonight, with gusts of more than sixty miles an hour expected on high ground.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The coastguard says people should stay away from harbour walls and cliff paths until the wind drops. The warnings last until noon tomorrow.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/27",
      durMs: 125_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "A satellite built by students at the University of Lannick has sent back its first photograph of Earth.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Kittiwake-1 reached its final orbit two days ago. Kemi Adewale was with the team when the picture came in.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The picture arrived just after two this afternoon, a line at a time, over about eleven minutes.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "Students had taken turns at the receiver since the satellite reached orbit, waiting for a clear pass over the city.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The satellite is the size of a shoebox. It was designed, built and tested by forty students over four years.",
        },
        {
          speaker: "OONA STRAND",
          intent: "state",
          text: "We had only ever seen test images of the lab ceiling. Then the coastline came in, and somebody said, that's us.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The photograph shows the coast from Gull Point to the mouth of the Tolle, with cloud from the gale already moving in.",
        },
        {
          speaker: "KEMI",
          intent: "ask",
          text: "What will the satellite do now?",
        },
        {
          speaker: "OONA STRAND",
          intent: "answer",
          text: "It takes one picture a day for a year. Schools can ask for a place, and we'll point the camera at it.",
        },
        {
          speaker: "KEMI (V.O.)",
          intent: "state",
          text: "The university will put the first pictures on show in a gallery on its campus in ten days' time.",
        },
        {
          speaker: "KEMI",
          intent: "state",
          text: "Kemi Adewale, Lannick One News, University of Lannick.",
        },
      ],
      brackets: [
        "T=0:17 the control room as the picture arrives",
        "T=0:16 the first photograph, shown full screen",
      ],
    },
    {
      slug: "stories/28",
      durMs: 210_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Dr. Halima Sarr is the astronomer who supervised the Kittiwake-1 team, and she is with me in the studio. Good evening.",
        },
        {
          speaker: "HALIMA SARR",
          intent: "state",
          text: "Good evening, Owen. And may I say first, the students did this. I mostly signed forms and brought biscuits.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "Is it hard to take a photograph from orbit with something the size of a shoebox?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "Hard. It travels at nearly five miles a second, so the camera has a few thousandths of a second to catch the picture cleanly.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "And why did the first picture take eleven minutes to arrive?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "The radio is small, and so is the dish on the physics building. The picture comes down a line at a time.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "What were the team hoping to see?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "Anything at all, honestly. A first picture tells you the camera works, the satellite points the right way, and the radio link holds.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "And it showed Lannick.",
        },
        {
          speaker: "HALIMA SARR",
          intent: "state",
          text: "It did. That was planned. The team worked out the pass weeks ago, so the first picture would be of home.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Tell us what we're looking at.",
        },
        {
          speaker: "HALIMA SARR",
          intent: "state",
          text: "That bright curve is the beach at Gull Point. The dark line running inland is the Tolle, and that smudge is tonight's gale.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "So the satellite saw the weather coming before we did?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "About an hour before, yes. I'd still trust Carys over a shoebox, though.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "What happens to Kittiwake-1 from here?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "A year of pictures, one a day. Then it drops out of orbit and burns up, which is the tidy way to end.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "And schools can ask for a picture of their own town?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "They can. A school sends us a place and a reason, and the students choose which requests to point the camera at.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "Will there be a Kittiwake-2?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "There is a design on a whiteboard, and a great many opinions about it. The money is the next conversation.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "Did the gale make tonight's pass any harder?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "Not up there. Down here, the dish on the roof has to be tied down, so the next pass waits until morning.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "What did the students say when the picture came in?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "Not much, for about a minute. Then everyone wanted to find their own street, which at this distance is not possible.",
        },
        {
          speaker: "OWEN",
          intent: "ask",
          text: "Where can people see the pictures?",
        },
        {
          speaker: "HALIMA SARR",
          intent: "answer",
          text: "The gallery at the university opens in ten days. Until then, every picture goes on our website the evening it arrives.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Dr. Halima Sarr, thank you.",
        },
        {
          speaker: "HALIMA SARR",
          intent: "state",
          text: "Thank you, Owen.",
        },
      ],
      brackets: ["T=0:22 the photograph on the studio screen"],
    },
    {
      slug: "stories/29",
      durMs: 55_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "For the first time in forty years there are otter cubs in the Tolle, and tonight we have the first pictures of them.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "The pictures were taken at dawn by a camera the university's river survey left on the bank below the weir.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "They show a female and two cubs, about three months old, swimming close to the reeds and climbing out on to a fallen branch.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "The survey found otters breeding in the river three days ago. The university says the water is cleaner than it has been in decades.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "It is asking walkers to keep dogs on leads along that stretch of the bank.",
        },
      ],
      brackets: ["T=0:06 the cubs on the fallen branch, with natural sound"],
    },
    {
      slug: "stories/30",
      durMs: 40_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The Lannick Philharmonic has announced its new season, which opens with a free concert on Exchange Square.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "The orchestra will give thirty-two concerts, including six for schools and two new pieces by composers from the city.",
        },
        {
          speaker: "GRACE (V.O.)",
          intent: "state",
          text: "Tickets go on sale next week. The orchestra says a quarter of the seats at every concert will cost no more than a tram fare.",
        },
      ],
      brackets: ["T=0:09 the orchestra rehearsing"],
    },
    {
      slug: "stories/31",
      durMs: 35_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The line-up for the Lannick book festival has been announced. It opens in nine days, with more than sixty writers over five days.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "Most events will be held at the Mercer Street library and the university. A third of them are free.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The festival will hold its first event for children in the lighthouse museum at Gull Point.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "Tickets are on sale at the library desk from tomorrow morning.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/32",
      durMs: 130_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Lannick Athletic are through to the next round of the cup after beating Port Allard two-nil in last night's replay.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Kojo Danso has been at the training ground today, where the talk was already of the next game.",
        },
        {
          speaker: "KOJO (V.O.)",
          intent: "state",
          text: "The first goal came after twenty minutes, a header from Kieran Fallow at the far post.",
        },
        {
          speaker: "KOJO (V.O.)",
          intent: "state",
          text: "The second was a penalty, ten minutes from the end, after the Port Allard keeper brought down a substitute.",
        },
        {
          speaker: "DEV ANSARI",
          intent: "state",
          text: "We drew with them a week ago and they made us look ordinary. Last night we were patient, and we kept the ball.",
        },
        {
          speaker: "KOJO (V.O.)",
          intent: "state",
          text: "Athletic have now gone five games without losing. Last night's crowd was over eleven thousand, the highest of the season.",
        },
        {
          speaker: "KIERAN FALLOW",
          intent: "state",
          text: "I'd been practising that header all week. The coaches will tell you I missed most of them.",
        },
        {
          speaker: "KOJO",
          intent: "ask",
          text: "Can the team keep this up in the league?",
        },
        {
          speaker: "DEV ANSARI",
          intent: "answer",
          text: "If we defend the way we did last night, yes. Harrowfield will be a different test, and we'll need the crowd.",
        },
        {
          speaker: "KOJO (V.O.)",
          intent: "state",
          text: "At the ground this morning, supporters queued for tickets for the next round.",
        },
        {
          speaker: "SUPPORTER",
          intent: "state",
          text: "I've had a season ticket for thirty years. You don't get many nights as good as that, so you remember them.",
        },
        {
          speaker: "KOJO",
          intent: "state",
          text: "Kojo Danso, Lannick One News, at the Athletic training ground.",
        },
      ],
      brackets: [
        "T=0:20 both goals from last night's replay",
        "T=0:11 the queue outside the ticket office",
      ],
    },
    {
      slug: "stories/33",
      durMs: 30_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Athletic will be without their captain for the home game against Harrowfield Town in five days' time.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The club says he hurt an ankle in training and should be fit again by the end of the month.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Kieran Fallow is expected to start in his place. The manager names his side on the morning of the game.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The club says fewer than five hundred tickets are left.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/34",
      durMs: 45_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "The Tolle Valley Herons are top of the basketball league for the first time in the club's history.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "They won away by four points last night, with their captain, Rob Kinsella, scoring the last six.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "The Herons play at the sports hall in Halse Park, which holds eight hundred people. The club says next week's game sold out by lunchtime.",
        },
      ],
      brackets: ["T=0:15 the last basket, and the bench on its feet"],
    },
    {
      slug: "stories/35",
      durMs: 35_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "Crews from the University of Lannick have been out on the Tolle this week, training for the first race of the term.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "Eight crews use the stretch between the weir and Tolle Bridge each morning from half past six.",
        },
        {
          speaker: "OWEN (V.O.)",
          intent: "state",
          text: "The boat club says no crews will go out tomorrow until the wind drops.",
        },
      ],
      brackets: ["T=0:10 a crew of eight passing under the bridge"],
    },
    {
      slug: "stories/36",
      durMs: 30_000,
      lines: [
        {
          speaker: "OWEN",
          intent: "state",
          text: "More than three hundred children from twenty-two swimming clubs took part in the junior gala at the Halse Park pool at the weekend.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "The Ardle club won the most races, and two club records were broken, both by swimmers aged eleven.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "Next year's gala will be held in Ardle, where a new pool opens in the spring. The organisers say entries were up by a third.",
        },
      ],
      brackets: [],
    },
    {
      slug: "stories/38",
      durMs: 35_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "Tomorrow in Lannick: the night market opens on Exchange Square at five, if the wind has dropped.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The ferry to Wrenna Island is expected to run again from seven in the morning.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "And at Gull Point, the lighthouse museum reopens the day after.",
        },
      ],
      brackets: ["T=0:14 graphic: tomorrow's diary"],
    },
    {
      slug: "stories/39",
      durMs: 45_000,
      lines: [
        {
          speaker: "GRACE",
          intent: "state",
          text: "The headlines again. The old Tolle Exchange is to become Lannick's new central library, after councillors voted thirty-one to eight, with one abstention.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "A gale warning is in force for the coast tonight. The last ferry to Wrenna Island leaves Ardle at eight, and later sailings are cancelled.",
        },
        {
          speaker: "GRACE",
          intent: "state",
          text: "The University of Lannick's student satellite, Kittiwake-1, has sent back its first photograph of Earth.",
        },
        {
          speaker: "OWEN",
          intent: "state",
          text: "And in the cup, Lannick Athletic are through to the next round, after beating Port Allard two-nil last night.",
        },
      ],
      brackets: [],
    },
  ],
  barks: [],
});
