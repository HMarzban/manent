// Two small guides, a signal box at night in script and in prose, small enough for the generator to run out of lines.
import type { ProseGuide, StyleGuide } from "../../src/generate/index.ts";

export const TINY: StyleGuide = {
  project: "tiny",
  format: "screenplay",
  cast: [
    { cue: "JANE", name: "Jane Pell" },
    { cue: "TOM", name: "Tom Pell" },
    { cue: "ORLA", name: "Orla Venn" },
  ],
  places: ["INT. SIGNAL BOX", "EXT. LEVEL CROSSING"],
  names: [],
  vocabulary: [],
  beats: [
    {
      id: "tiny/script#1",
      scenes: [1, 2],
      pages: [1, 1],
      timeOfDay: "NIGHT",
      places: ["INT. SIGNAL BOX", "EXT. LEVEL CROSSING"],
      cast: ["JANE", "TOM"],
      summary: "Tom climbs up to the box with soup, and stays for the freight.",
    },
    {
      id: "tiny/script#2",
      scenes: [3, 4],
      pages: [2, 2],
      timeOfDay: "NIGHT",
      places: ["EXT. LEVEL CROSSING", "INT. SIGNAL BOX"],
      cast: ["JANE", "TOM", "ORLA"],
      summary: "The freight stops at the crossing, and Orla climbs down.",
    },
  ],
  style: { actionWords: 25, dialogueWords: 30, sentenceWords: 25, banned: [] },
  action: [
    "Jane checks the levers one by one, lips moving.",
    "Tom stamps the cold out of his boots on the top step.",
    "The kettle begins to rattle on the stove.",
    "Rain runs in a sheet down the east window.",
    "Jane writes the time in the register in pencil.",
    "Tom picks up the bell hammer and puts it down quickly.",
    "The needle on the instrument swings across.",
    "A fox crosses the line below, unhurried.",
    "Jane pulls the distant lever with both hands.",
    "The wire groans away into the dark.",
    "Tom presses his nose to the glass like a boy.",
    "The stove door glows orange round its edges.",
    "Jane wipes a clean circle in the misted window.",
    "Headlamps sweep the cutting and are gone.",
    "The whole box shudders as the wagons pass beneath.",
    "Tom counts under his breath and loses his place.",
    "Jane rings three, pause, one on the bell.",
    "The clock on the wall jumps a minute forward.",
    "Gravel dust drifts in under the door.",
    "Tom pours soup into the flask lid and offers it.",
    "Jane drinks without taking her eyes off the frame.",
    "The gate lamps swing in the wind below.",
    "A moth circles the bare bulb over the desk.",
    "Jane oils the stiffest lever from a long-spouted can.",
    "Tom sits on the spare stool, knees at his chin.",
    "The telephone on the wall stays silent.",
    "Jane puts the register back in its exact place.",
    "Wind finds the loose pane and plays it like a reed.",
    "Tom yawns and pretends he did not.",
    "The crossing gates shiver on their hinges.",
    "Jane lowers the home signal and listens.",
    "A long whistle sounds from beyond the cutting.",
    "Orla leans out of the cab and lifts a gloved hand.",
    "Orla climbs down from the footplate with a lamp.",
    "Jane waves the hand lamp twice towards Orla.",
    "Orla taps the brake pipe of the last wagon with a spanner.",
    "Tom and Orla shake hands at the bottom of the steps.",
    "Steam from the kettle fogs the north window.",
    "The fire settles in the stove with a soft crunch.",
    "Jane laughs once, quietly, at something Tom says.",
  ],
  dialogue: [
    { speaker: null, intent: "ask", text: "Is it far from here now?" },
    {
      speaker: "JANE",
      intent: "ask",
      text: "Did you bring the spare lamp from the shed?",
    },
    {
      speaker: "TOM",
      intent: "ask",
      text: "How long until the freight comes through?",
    },
    { speaker: null, intent: "ask", text: "Who rang the bell just then?" },
    {
      speaker: "ORLA",
      intent: "ask",
      text: "Is the crossing clear on your side?",
    },
    { speaker: null, intent: "ask", text: "When did you last oil the levers?" },
    {
      speaker: "TOM",
      intent: "ask",
      text: "Can I stay up here until it passes?",
    },
    { speaker: null, intent: "ask", text: "Why does the clock run fast?" },
    {
      speaker: null,
      intent: "answer",
      text: "About a mile, past the second gate.",
    },
    {
      speaker: "TOM",
      intent: "answer",
      text: "It's on the stool by the door.",
    },
    {
      speaker: "JANE",
      intent: "answer",
      text: "Twenty minutes, if the quarry let it go on time.",
    },
    {
      speaker: null,
      intent: "answer",
      text: "The box up the line, offering a train.",
    },
    {
      speaker: "JANE",
      intent: "answer",
      text: "Clear, and the gates are locked.",
    },
    {
      speaker: null,
      intent: "answer",
      text: "Yesterday, before the rain came in.",
    },
    {
      speaker: "JANE",
      intent: "answer",
      text: "You can, if you keep your feet off the frame.",
    },
    {
      speaker: null,
      intent: "answer",
      text: "Because Dad set it that way and nobody changed it.",
    },
    { speaker: "ORLA", intent: "answer", text: "Near enough, I'd say." },
    { speaker: null, intent: "answer", text: "Not that I know of." },
    {
      speaker: "JANE",
      intent: "instruct",
      text: "Put the kettle on, and fill it properly this time.",
    },
    {
      speaker: null,
      intent: "instruct",
      text: "Hand me the register from the desk.",
    },
    {
      speaker: "JANE",
      intent: "instruct",
      text: "Stand back from the window when it goes under.",
    },
    {
      speaker: null,
      intent: "instruct",
      text: "Shut the door before the stove goes out.",
    },
    {
      speaker: "ORLA",
      intent: "instruct",
      text: "Wave the lamp twice when you're ready for me.",
    },
    {
      speaker: null,
      intent: "instruct",
      text: "Write the time down before you forget it.",
    },
    {
      speaker: "TOM",
      intent: "instruct",
      text: "Hold the torch while I look at this.",
    },
    {
      speaker: null,
      intent: "state",
      text: "The wind's coming round to the east.",
    },
    {
      speaker: "JANE",
      intent: "state",
      text: "I've done this every night for eleven years.",
    },
    {
      speaker: "TOM",
      intent: "state",
      text: "I always thought you just pulled a handle.",
    },
    {
      speaker: null,
      intent: "state",
      text: "That bell gives me a fright every time.",
    },
    {
      speaker: "ORLA",
      intent: "state",
      text: "The brakes on the last wagon are dragging again.",
    },
    {
      speaker: null,
      intent: "state",
      text: "My hands are frozen to the bone.",
    },
    {
      speaker: "JANE",
      intent: "state",
      text: "The inspector comes on the first of the month.",
    },
    {
      speaker: "TOM",
      intent: "state",
      text: "Mum says you never ring her any more.",
    },
    {
      speaker: null,
      intent: "state",
      text: "There's soup left in the flask if you want it.",
    },
    {
      speaker: "JANE",
      intent: "state",
      text: "Nothing gets past this box without my say.",
    },
    {
      speaker: null,
      intent: "state",
      text: "The gravel dust gets into everything.",
    },
    {
      speaker: "ORLA",
      intent: "state",
      text: "I'll be back through at four with the empties.",
    },
    {
      speaker: null,
      intent: "state",
      text: "It's quieter up here than I expected.",
    },
    {
      speaker: "TOM",
      intent: "state",
      text: "I'm not tired, whatever you think.",
    },
    {
      speaker: null,
      intent: "state",
      text: "The fox is under the stairs again.",
    },
  ],
  tags: [
    "if you ask me",
    "same as every night",
    "near enough",
    "by that clock",
    "whatever the inspector says",
    "for what it's worth",
    "most nights",
    "give or take",
  ],
  stories: [],
  barks: [],
};

export const TINY_LEDGER =
  "Night freight, forty wagons, passed clear at eleven and four minutes. Brother present. Fox under stairs.";

export const TINY_PROSE: ProseGuide = {
  project: "tiny-prose",
  names: [],
  style: { actionWords: 0, dialogueWords: 0, sentenceWords: 30, banned: [] },
  chapters: [
    {
      number: 3,
      title: "The Night Freight",
      beats: [
        "Tom climbs up to the box.",
        "The freight is offered.",
        "The freight passes.",
      ],
      ledger: TINY_LEDGER,
      tags: ["box", "freight"],
    },
    {
      number: 21,
      title: "The Inspector",
      beats: ["The inspector reads the register."],
      ledger: "Inspector called. Register found in order.",
      tags: ["box"],
    },
    {
      number: 96,
      title: "The Last Shift",
      beats: ["Jane pulls the levers one last time."],
      ledger: "Box closed. Levers left as found.",
      tags: ["box"],
    },
  ],
  sentences: [
    {
      text: "Jane Pell had worked the signal box at the crossing for eleven winters, and she still counted the levers before every shift.",
      tags: ["box"],
    },
    {
      text: "The box stood on brick legs above the line, with a stove, a kettle, a desk and a clock that ran two minutes fast.",
      tags: ["box"],
    },
    {
      text: "Tom came up the steps at nine with a flask of soup and the look of someone who had walked further than he meant to.",
      tags: ["box"],
    },
    {
      text: "She told him to wipe his boots, because the floor had been polished that morning and she was not going to do it twice.",
      tags: ["box"],
    },
    {
      text: "The night freight was due at eleven, forty wagons of gravel from the quarry, and in eleven winters it had never once been early.",
      tags: ["freight"],
    },
    {
      text: "Jane wrote every time in the register in pencil first and then in ink, because that was how her father had always done it.",
      tags: ["box"],
    },
    {
      text: "The stove ticked as it cooled, and the wind found the one loose pane in the east window and played it like a reed.",
      tags: ["box"],
    },
    {
      text: "Tom sat on the spare stool with his knees nearly at his chin and asked whether anyone ever came up here to visit her.",
      tags: ["box"],
    },
    {
      text: "Nobody visited, she said, except the inspector twice a year and a fox that liked the warm bricks under the stairs.",
      tags: ["box"],
    },
    {
      text: "At ten the bell from the next box rang twice, which meant a train was offered, and Jane rang twice back to take it.",
      tags: ["freight"],
    },
    {
      text: "She pulled the distant lever with both hands and felt the wire take the strain all the way down the line in the dark.",
      tags: ["freight"],
    },
    {
      text: "Tom watched the lamp on the frame turn from red to green and said that it was the first time he had understood her job.",
      tags: ["box"],
    },
    {
      text: "Jane said there was nothing to understand, only a great deal to remember, and she bent over the register again.",
      tags: ["box"],
    },
    {
      text: "The freight came out of the cutting with its headlamp swinging, and the whole box shook as the wagons went under it.",
      tags: ["freight"],
    },
    {
      text: "Tom counted the wagons aloud and lost his place at twenty-six, and Jane told him there were forty without looking up.",
      tags: ["freight"],
    },
    {
      text: "When the tail lamp had gone by she rang the bell to the next box to say that the train was clear of her section.",
      tags: ["freight"],
    },
    {
      text: "Then she wrote the time in the register, eleven and four minutes, and underlined it, which she did not usually do.",
      tags: ["box"],
    },
    {
      text: "Tom asked why she had underlined it, and she said it was the first time in a month that anyone had watched it pass with her.",
      tags: ["box"],
    },
    {
      text: "He did not know what to say to that, so he poured the last of the soup into the flask lid and handed it across.",
      tags: ["box"],
    },
    {
      text: "Below them the crossing gates rattled in their frames, and somewhere along the cutting a sheep complained about the weather.",
      tags: ["box"],
    },
    {
      text: "The kettle had boiled dry twice that winter, and Jane had bought a new one with her own money rather than fill in a form.",
      tags: ["box"],
    },
    {
      text: "The levers were numbered in white paint, one to twenty, and the paint on the busiest ones had worn down to the bare iron.",
      tags: ["box"],
    },
    {
      text: "Every wagon of the freight was loaded at the quarry by the same old foreman, who chalked his initials on the end of each one.",
      tags: ["freight"],
    },
    {
      text: "On clear nights Jane could see the headlamp of the freight four miles off, a single star that grew larger and never twinkled.",
      tags: ["freight"],
    },
    {
      text: "On wet nights she heard it before she saw it, a long low grumble coming up through the legs of the box into her boots.",
      tags: ["freight"],
    },
    {
      text: "The driver of the freight always lifted a hand as he passed, and Jane always lifted one back, though they had never spoken.",
      tags: ["freight"],
    },
    {
      text: "Tom said that was the strangest friendship he had ever heard of, and Jane said it was the most reliable one she had.",
      tags: ["freight"],
    },
    {
      text: "The fox came out from under the stairs as the last wagon went by, sat in the lamplight for a moment and then trotted off.",
      tags: ["box"],
    },
    {
      text: "Tom wanted to give it a name, and Jane told him firmly that it already had one, and it was none of his business.",
      tags: ["box"],
    },
    {
      text: "The register lay open on the desk, and the pencil sat in the groove of its spine where it had sat for eleven years.",
      tags: ["box"],
    },
    {
      text: "Jane had filled nine registers since she started, and kept the full ones on the shelf above the stove, in order, spines out.",
      tags: ["box"],
    },
    {
      text: "Tom took one down at random and read out a night in the second winter when the snow had stopped every train but the freight.",
      tags: ["freight"],
    },
    {
      text: "She remembered it at once, and told him how the driver had climbed down to clear the points with a shovel and a bucket of salt.",
      tags: ["freight"],
    },
    {
      text: "The clock on the wall ran two minutes fast because their father had set it that way, and Jane had never had the heart to change it.",
      tags: ["box"],
    },
    {
      text: "Tom said that was sentimental, and Jane said it was practical, because she always knew exactly how wrong it was.",
      tags: ["box"],
    },
    {
      text: "By midnight the stove had burned low, and the box smelled of soup and coal smoke and the oil she used on the levers.",
      tags: ["box"],
    },
    {
      text: "The empties would come back through at four, lighter and louder, and she would be awake for them as she always was.",
      tags: ["freight"],
    },
    {
      text: "Tom offered to stay, and she said he could if he kept his feet off the frame and did not touch the bell again.",
      tags: ["box"],
    },
    {
      text: "He fell asleep on the stool within the hour, his head against the window, his breath clouding a small patch of the glass.",
      tags: ["box"],
    },
    {
      text: "Jane put her coat over him and went back to the desk, and wrote in the register that her brother had been present.",
      tags: ["box"],
    },
    {
      text: "Then, because it was true and nobody would read it, she added that the fox had been under the stairs again.",
      tags: ["box"],
    },
    {
      text: "The wire to the distant signal sang a little in the wind, a thin high note that she had stopped hearing years ago.",
      tags: ["freight"],
    },
    {
      text: "Tonight she heard it again, perhaps because someone else was there, and she listened to it for a long while.",
      tags: ["box"],
    },
    {
      text: "At half past three the bell from the next box woke Tom with a start, and he asked whether it was the freight already.",
      tags: ["freight"],
    },
    {
      text: "It was the empties, she said, and she rang back twice and pulled the distant lever, and felt the wire take the strain once more.",
      tags: ["freight"],
    },
    {
      text: "The empty wagons rattled under the box like a long row of tin cans, and the driver lifted his hand, and Jane lifted hers.",
      tags: ["freight"],
    },
    {
      text: "Tom lifted his too, a moment too late, and the driver would never know, but Jane saw it and said nothing.",
      tags: ["freight"],
    },
    {
      text: "When the tail lamp had gone she wrote the time, four and seven minutes, and did not underline it, and closed the register.",
      tags: ["box"],
    },
    {
      text: "Dawn came up grey over the cutting, and the sheep started again, and Tom said he would come back next week if she liked.",
      tags: ["box"],
    },
    {
      text: "She said she would not mind, which was as close as she ever came to asking anyone for anything at all.",
      tags: ["box"],
    },
    {
      text: "The harbour lay flat and grey at the bottom of the hill, and the gulls stood about on the wall waiting for the boats.",
      tags: ["harbour"],
    },
    {
      text: "Fishing boats came in one by one on the morning tide, low in the water, with their lamps still lit against the mist.",
      tags: ["harbour"],
    },
  ],
};
