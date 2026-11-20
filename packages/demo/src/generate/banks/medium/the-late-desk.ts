// The phrase bank of The Late Desk, in the voice of the show.
import type { StyleGuide } from "../../guide.ts";

export const LATE_DESK_GUIDE: StyleGuide = Object.freeze<StyleGuide>({
  project: "the-late-desk",
  format: "variety",
  cast: [
    { cue: "HOST", name: "Benny Laird" },
    { cue: "TESSA", name: "Tessa Morland" },
    { cue: "HALIMA", name: "Dr. Halima Sarr" },
  ],
  places: [],
  names: [
    "The Late Desk",
    "Lannick",
    "Tolle Exchange",
    "Exchange Square",
    "Halse Park",
    "Wrenna",
    "Harbour Lights",
    "Ida",
    "Kittiwake-1",
    "University of Lannick",
    "Earth",
    "Gull Point",
    "Lannick General",
    "Lannick Athletic",
    "Port Allard",
    "Tolle Bridge",
    "The Weir Street Band",
    "Gita Ramsden",
    "City Librarian",
    "Mailbag",
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
      slug: "segments/1",
      durMs: 130_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "Right. The council voted this afternoon, so as of today this building is the new central library. And I have a book to return.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "Hello? Is anybody on the desk?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "Nobody on the desk. Forty pigeons, one bucket and a sign saying the building closed twelve years ago.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "I'll be honest with you, sir. It's a little overdue. It's a book about a lighthouse, and I got as far as the lighthouse.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "Is there a fine? Do you take coins?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "He's taken the coin. He's flown it up to the roof, and he didn't even leave me a receipt.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "That's the quickest anything in the Tolle Exchange has moved since it shut.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "The council says the design consultation opens next week and runs for three weeks, so you can all put in for a nicer ledge.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Write it down. No, don't write anything down. You've done enough to these steps.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "He's gone. They've all gone. I've never been ignored by a whole building before, and I work in television.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "All right, if nobody is going to stamp it, I'll stamp it myself. There. Book returned, with thanks, to the pigeons of Lannick.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "I'll leave the book here, on the step. If anyone from the council asks, it was the pigeons.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "From the Tolle Exchange, which is a library now, apparently: this is The Late Desk.",
        },
      ],
      brackets: [
        "T=0:08 night, the steps of the Tolle Exchange, Benny holding a library book",
        "T=0:05 a pigeon lands on the book and looks at the date stamp",
        "T=0:07 the whole ledge takes off at once",
        "T=0:05 titles over the empty doorway",
      ],
    },
    {
      slug: "segments/4",
      durMs: 260_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "Every week we read the news so you don't have to, and every week we wish we hadn't. Here are the things we learned.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We learned that tram line 3 now runs all the way to Halse Park.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "It used to stop just short of Halse Park, which was more honest.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "The first tram to Halse Park was full. The second tram was full of the people from the first tram, trying to get home.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We learned the council can count to forty. Not first time. The first count was thirty-one to nine.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Then the clerk counted again and found thirty-one to eight, with one abstention. One councillor had voted, then thought better of it.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "What do you call a councillor who changes his mind in the middle of a count?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "In Lannick, we call him re-elected.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We learned that twelve primary schools are trying out new school meals. The children will mark the food out of ten.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "This is the first time anyone in this city has asked a nine-year-old for a review and then had to publish it.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We learned that a patients' group wants a review of the car park charges at Lannick General.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "The hospital says the charges are fair. The hospital also says the coffee is coffee, so we'll wait for a second opinion.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We learned that a hundred and forty homes have been approved on the old dye works site.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "If you've ever walked past the dye works on a wet day, you'll know those homes come with their own colour scheme.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We learned from the census that Lannick is now the fourth-fastest-growing city in the country.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Fourth. Not first, not second. Fourth. Even when we're growing, we're growing at a sensible speed.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "The council says it is good news for the city.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "It also says the roads were built for a much smaller one, and it would know.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "And we learned that Tolle Bridge will close every night from ten till five while they resurface it.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "That's four nights. The council says it's the quietest time on the bridge, because it has never once tried to get home from this show.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We learned that the lighthouse museum at Gull Point reopens the day after tomorrow, after its restoration.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "They've cleaned the lens, painted the stairs and fixed the light. Which is more than they've done for this desk.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "And we learned that this show is the city's fourth-favourite thing to watch after eleven, so at least we're keeping up with the census.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "The three ahead of us?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "A test card, a weather map and a camera pointed at the river Tolle at low tide.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We've asked the bridge roadworks to come on as a guest next week. They said yes, but only after ten.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We found all this out so you didn't have to, and frankly, you owe us.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Those are the things we learned this week. Next week, we hope to learn less.",
        },
      ],
      brackets: [
        "T=0:06 desk camera, the title card comes up behind Benny",
        "T=0:04 graphic of the new tram map, one line drawn on by hand",
        "T=0:05 the clerk's tally sheet, one vote crossed out",
        "T=0:04 photo of the old dye works with a planning notice on the gate",
        "T=0:05 the census chart, Lannick in fourth place",
        "T=0:06 the band plays the desk piece out",
      ],
    },
    {
      slug: "segments/5",
      durMs: 220_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "It's time for the Mailbag, where you write to us and we read your letters out loud, whether you meant us to or not.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "First, from a viewer in Halse Park.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "Dear Benny, now the tram comes all the way out to us, is there any way to send you back on it?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "There is, madam. It leaves every twelve minutes. I'll be on the next one, and I'm bringing the band.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Next, a letter from Wrenna. It came over on the last ferry, which is more than the man who wrote it managed.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "Dear Benny, if I'm going to be stuck on the island all night, can I at least watch something else?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "No. On Wrenna tonight there's the gale, there's us, and there's a man on the harbour wall with a torch. We checked his ratings.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "A letter from a reader by the river. Dear Benny, I have now seen the otter cubs in the Tolle with my own eyes.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "They were livelier than your show, and they were asleep. She's sent a photo. I'd like to point out the otters aren't moving either.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Next, a card from a primary school in the school meals trial. The children have been asked to give marks out of ten.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "The fish pie got a nine. The new carrots got a seven. They've given me a four, and said I need more vegetables.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "A note from Exchange Square. The night market opens there tomorrow, and the stallholders would like to know if I'm coming.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "I am, my dear stallholders. I'm bringing my own bag.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "I'm told that's what you do, and I'm sorry to say nobody has told me why.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "A postcard from Gull Point. The lighthouse museum reopens the day after tomorrow, and they'd like me to cut the ribbon.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "I'd be delighted. I've cut a lot of things from this show.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "One more. Dear Benny, the university's satellite can take photographs of the whole city from space. Can it see my house?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "It can, sir. It can also see your gutters. We've had a look, and we've passed the picture to your neighbours.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "And finally, from a viewer who has watched every show since the first. Dear Benny, please could you stop.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "That one's from my mother. Hello, Mum. I know you're watching, because you wrote to tell me you're not.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Keep them coming. Write to us at The Late Desk, Lannick, and we will read them, eventually, in the order they upset me.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "That's the Mailbag. If yours wasn't read tonight, we keep it in the sack, it's safe, and it's still better than the opening.",
        },
      ],
      brackets: [
        "T=0:05 the mailbag set, a sack of letters on the desk",
        "T=0:04 Benny tips out the sack and one envelope stays inside",
        "T=0:06 a viewer's photo of two otter cubs on a riverbank, slightly out of focus",
        "T=0:05 the band plays Benny back to the desk",
      ],
    },
    {
      slug: "segments/7",
      durMs: 40_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "My first guest plays Ida, the ferry captain on Harbour Lights, which tonight is the only boat out of Wrenna running to its timetable.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "A whole series at the wheel, and she still won't stand at the front of a tram. Please welcome Tessa Morland.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "Hello, Lannick. And hello to everyone stuck on Wrenna tonight. I did try to hold the boat for you.",
        },
      ],
      brackets: [
        "T=0:06 Tessa walks on to the theme of Harbour Lights",
        "T=0:04 a clip of the ferry in heavy weather on the screen",
      ],
    },
    {
      slug: "segments/9",
      durMs: 245_000,
      lines: [
        {
          speaker: "HOST",
          intent: "ask",
          text: "Excuse me. Sorry. Is this the quiet carriage?",
        },
        {
          speaker: "TESSA",
          intent: "answer",
          text: "It is. It says so on the window. It says so on the seat. It says so on the back of my book.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "Do you mind if I sit here? Every other seat is next to a man with a drum.",
        },
        {
          speaker: "TESSA",
          intent: "answer",
          text: "I'd say yes, but you've already sat down.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Lovely. I've been wanting some quiet. It's been such a busy day for news.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "Good. Then you'll enjoy the quiet.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "The council voted for a library today. In the Tolle Exchange. Thirty-one to nine. Then thirty-one to eight.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "That's lovely. Now, excuse me. Shh.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Sorry. Sorry. Quiet carriage.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Only, there's a gale on the coast tonight, and they've brought the last Wrenna ferry forward to eight o'clock.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "I know. I live on Wrenna. I watched it go. That's why I'm on a tram reading the same page for the fourth time.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "Oh no. Where will you sleep tonight?",
        },
        {
          speaker: "TESSA",
          intent: "answer",
          text: "Somewhere quiet, I hope.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Right. Yes. Quiet. I'll just whisper the rest.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "There are otter cubs in the Tolle. The first in forty years. They've got pictures. One of them is holding a stone.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "That is not a whisper. That is a voice with the lights turned down.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "I'm sorry, I can't help it. I do the news for a living. I do jokes about the news, which is the news, but later.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "Then save it for later. Save it for somewhere with a microphone and people who chose to be there.",
        },
        {
          speaker: "HOST",
          intent: "ask",
          text: "Can I at least tell you about the dye works?",
        },
        {
          speaker: "TESSA",
          intent: "answer",
          text: "You can tell the window. The window has a sign on it, and the sign is on my side.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "Every morning I get forty minutes of nothing on this tram. It's all I get.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "The university's satellite took its first photograph of Earth. You can see the whole city. You can see this tram.",
        },
        {
          speaker: "TESSA",
          intent: "ask",
          text: "If I hold up my book, will they see the word quiet from space?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "I think it's more of a photograph of clouds. But it's a start.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Last one. A hundred and forty homes on the old dye works. Think of the neighbours. Think how quiet they'll be.",
        },
        {
          speaker: "TESSA",
          intent: "state",
          text: "This tram goes to Halse Park. It takes forty minutes. I have read the timetable, and so far you have told me the entire news.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Not the sport. Lannick Athletic beat Port Allard two-nil in the replay last night.",
        },
        {
          speaker: "TESSA",
          intent: "ask",
          text: "Driver. Driver, can you stop the tram? This man has just done the sport.",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "The driver can't hear you, I'm afraid. The driver's in the loud carriage, with the man with the drum.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "There's no need for that anyway. I'll be very quiet from now on. You won't hear another word from me, apart from goodnight.",
        },
        {
          speaker: "TESSA",
          intent: "ask",
          text: "Do you promise me?",
        },
        {
          speaker: "HOST",
          intent: "answer",
          text: "I promise. And, oh, the weather. It's a gale. You'll want a coat.",
        },
      ],
      brackets: [
        "T=0:06 a tram carriage at night, a sign on the window saying quiet please",
        "T=0:04 the tram bell rings, much too loud",
        "T=0:08 Benny folds a newspaper as loudly as a newspaper can be folded",
        "T=0:05 an inspector walks through without a word and clips both tickets",
        "T=0:04 Tessa holds up a hand-written sign that reads shh",
        "T=0:06 the tram reaches the end of the line and the carriage lights go out",
      ],
    },
    {
      slug: "segments/10",
      durMs: 35_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "My next guest is an astronomer at the University of Lannick. Today her students' satellite, Kittiwake-1, sent home its first photograph of Earth.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "We looked, and we're in it, just under a cloud.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Please welcome Dr. Halima Sarr.",
        },
        {
          speaker: "HALIMA",
          intent: "state",
          text: "Thank you. It's the students' picture, really, not mine.",
        },
      ],
      brackets: [
        "T=0:05 the first photograph from the satellite fills the big screen",
        "T=0:05 Dr. Sarr walks on to the theme",
      ],
    },
    {
      slug: "segments/12",
      durMs: 25_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "When the council opened the tram line 3 extension last week, they said it went all the way to Halse Park.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "I rode it to the end, to check. I took sandwiches, and I needed every one. Here's what's at the end of the line.",
        },
      ],
      brackets: ["T=0:05 Benny turns to the screen beside the desk"],
    },
    {
      slug: "segments/14",
      durMs: 20_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "They rehearse under the railway arches, which explains the echo and the trains. Here with a new song, please welcome The Weir Street Band.",
        },
      ],
      brackets: ["T=0:08 lights come up on the band stage"],
    },
    {
      slug: "segments/16",
      durMs: 30_000,
      lines: [
        {
          speaker: "HOST",
          intent: "state",
          text: "That's our show. We thank Tessa Morland, Dr. Halima Sarr and The Weir Street Band.",
        },
        {
          speaker: "HOST",
          intent: "state",
          text: "Tomorrow, the City Librarian, Gita Ramsden, so wear soft shoes. Mind the gale on your way home, and hold on to your hat. Goodnight, Lannick.",
        },
      ],
      brackets: [
        "T=0:06 the band plays the theme under the goodnights",
        "T=0:04 lights down on the desk",
      ],
    },
  ],
  barks: [],
});
