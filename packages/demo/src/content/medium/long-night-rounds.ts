// Earlier development rounds on The Long Night: First draft (14), Network (9) and Table read (6).
import { addressedThread, declinedThread } from "./long-night-together.ts";
import type {
  LongNightTarget,
  LongNightThread,
} from "./long-night-together.ts";

const page = (n: number): LongNightTarget => ({ kind: "page", page: n });
const scene = (n: number): LongNightTarget => ({ kind: "scene", scene: n });

/** Leo's 14 comments on First draft (D−66), all resolved with replies by D−49. */
export const LONG_NIGHT_FIRST_DRAFT_THREADS: readonly LongNightThread[] =
  Object.freeze([
    addressedThread(
      "D−66 09:10",
      "leo",
      page(2),
      "Love Mr. Adeyemi humming in the lobby. Keep him warm before the lights go.",
      ["D−64 10:30", "dana", "Kept the full exchange by the lift doors."],
      "D−64 10:35",
    ),
    addressedThread(
      "D−66 09:35",
      "leo",
      page(5),
      "Make sure we clock the envelope in Tomas's pocket before he leaves the depot.",
      [
        "D−64 11:15",
        "dana",
        "Added the beat with the envelope already soft from being opened.",
      ],
      "D−64 11:20",
    ),
    addressedThread(
      "D−66 10:05",
      "leo",
      page(9),
      "Who is Halloran to them?",
      [
        "D−62 14:40",
        "dana",
        "Answered with a line about Halloran knowing Jane's father.",
      ],
      "D−62 14:45",
    ),
    addressedThread(
      "D−66 10:30",
      "leo",
      page(14),
      "Can Tomas clear the stranded tram faster so we stay with Callow House?",
      ["D−60 09:50", "dana", "Trimmed half a page on the bridge walk."],
      "D−60 09:55",
    ),
    addressedThread(
      "D−66 11:00",
      "leo",
      page(20),
      "Establish the empty winding-wheel hook cleanly so the trip to the yard pays off.",
      [
        "D−58 15:20",
        "sam",
        "Put a clear beat on the empty hook in the motor room.",
      ],
      "D−58 15:25",
    ),
    addressedThread(
      "D−66 11:30",
      "leo",
      page(27),
      "Jane's old work pass opening the cage is neat — let the watchman doubt it first.",
      [
        "D−57 11:30",
        "sam",
        "Gave the night-watchman a beat squinting at the cracked photo.",
      ],
      "D−57 11:35",
    ),
    addressedThread(
      "D−66 12:10",
      "leo",
      page(35),
      "How heavy is the winding wheel? Show the weight when she carries it back.",
      [
        "D−55 16:10",
        "dana",
        "Added the rag wrapped round the rim and the weight on the stairs.",
      ],
      "D−55 16:15",
    ),
    addressedThread(
      "D−66 13:15",
      "leo",
      page(42),
      "The stairwell turning into a street is a highlight. Give Lewis a proper entrance.",
      [
        "D−54 11:00",
        "sam",
        "Brought Lewis down two steps at a time with his phone torch.",
      ],
      "D−54 11:05",
    ),
    addressedThread(
      "D−66 13:50",
      "leo",
      page(49),
      "Make sure Mrs. Adeyemi feels like she runs the fourteenth floor.",
      [
        "D−53 14:20",
        "sam",
        "Gave her the ring of spare keys and the tea flasks on the landing.",
      ],
      "D−53 14:25",
    ),
    addressedThread(
      "D−66 14:25",
      "leo",
      page(55),
      "Let Irena wander to the roof before Tomas notices her slippers in the hall.",
      ["D−52 10:15", "dana", "Moved the empty bed beat up by one scene."],
      "D−52 10:20",
    ),
    addressedThread(
      "D−66 15:00",
      "leo",
      scene(61),
      "This speech is the film",
      [
        "D−51 11:40",
        "dana",
        "Noted — Mr. Adeyemi's song stays the centre of Act Two.",
      ],
      "D−51 11:45",
    ),
    addressedThread(
      "D−66 15:40",
      "leo",
      page(72),
      "The argument over the Holmport letter hits hard — don't soften Jane too soon.",
      [
        "D−50 15:50",
        "sam",
        "Kept Jane folding the letter along its creases without looking up.",
      ],
      "D−50 15:55",
    ),
    addressedThread(
      "D−66 16:15",
      "leo",
      page(83),
      "Irena mending the transistor radio with valve parts needs a crisp sound payoff.",
      [
        "D−49 16:10",
        "sam",
        "Built the hiss-to-hum moment as she turns the dial a hair's width.",
      ],
      "D−49 16:15",
    ),
    addressedThread(
      "D−66 16:50",
      "leo",
      page(98),
      "Clarify Tomas holding the brake while Jane hand-winds so the stakes read cleanly.",
      [
        "D−49 17:10",
        "dana",
        "Tightened the turn-and-call rhythm between Jane, Tomas and Lewis.",
      ],
      "D−49 17:15",
    ),
  ]);

/** Network round on Second draft (D−45): 9 items, 7 addressed and 2 declined. */
export const LONG_NIGHT_NETWORK_THREADS: readonly LongNightThread[] =
  Object.freeze([
    addressedThread(
      "D−45 10:05",
      "leo",
      page(4),
      "Can Irena hold the valve up to the light right after Tomas hangs up?",
      [
        "D−44 10:40",
        "dana",
        "Moved Irena's beat to land straight on the receiver clicking down.",
      ],
      "D−44 10:45",
    ),
    addressedThread(
      "D−45 10:30",
      "leo",
      page(18),
      "Tighten the climb to the motor room — two landings, not four.",
      ["D−44 11:20", "dana", "Cut two intermediate stair beats."],
      "D−44 11:25",
    ),
    addressedThread(
      "D−45 11:00",
      "leo",
      page(31),
      "Give Halloran one dry line in the yard so he stays present while Jane unlocks the cage.",
      ["D−42 15:00", "dana", "Added a line from Halloran by the van door."],
      "D−42 15:05",
    ),
    addressedThread(
      "D−45 11:30",
      "leo",
      scene(61),
      "We miss the long version of Mr. Adeyemi's song — the first draft had it.",
      ["D−40 11:08", "dana", "Restored scene 61 from First draft."],
      "D−40 11:10",
    ),
    addressedThread(
      "D−45 12:15",
      "leo",
      page(68),
      "Mrs. Adeyemi's photograph of Joseph at thirty lands beautifully — hold a beat.",
      [
        "D−42 15:30",
        "dana",
        "Gave Jane an extra beat looking at the picture by torchlight.",
      ],
      "D−42 15:35",
    ),
    addressedThread(
      "D−45 13:10",
      "leo",
      page(79),
      "Make sure we hear the emergency broadcast say the brigade won't reach Callow House before dawn.",
      [
        "D−42 16:10",
        "dana",
        "Spelled it out on the radio so Jane's decision turns on it.",
      ],
      "D−42 16:15",
    ),
    addressedThread(
      "D−45 14:00",
      "leo",
      page(95),
      "Can the winding wheel slip once near the end so the risk feels physical?",
      [
        "D−38 11:30",
        "sam",
        "Added the quarter-turn slip before Jane catches it.",
      ],
      "D−38 11:35",
    ),
    declinedThread(
      "D−45 14:40",
      "leo",
      page(82),
      "Could Irena use a phone app or digital scanner instead of the old valve parts?",
      [
        "D−34 15:40",
        "sam",
        "The radio stays analogue — it's the point of Irena",
      ],
      "D−34 15:42",
    ),
    declinedThread(
      "D−45 15:10",
      "leo",
      page(110),
      "Should Tomas announce he is turning down Holmport at breakfast?",
      [
        "D−34 15:50",
        "sam",
        "Better left unspoken — him staying to burn the toast says enough.",
      ],
      "D−34 15:55",
    ),
  ]);

/** Table read round on Table read draft (D−30): 6 items, all addressed by D−25. */
export const LONG_NIGHT_TABLE_READ_THREADS: readonly LongNightThread[] =
  Object.freeze([
    addressedThread(
      "D−30 10:15",
      "leo",
      page(11),
      "Read aloud, the lobby noticeboard feels one line long.",
      [
        "D−27 11:00",
        "dana",
        "Tightened to three items: cat, choir, lift letter.",
      ],
      "D−26 10:15",
    ),
    addressedThread(
      "D−30 10:45",
      "dana",
      page(23),
      "Bev's cadence at the depot gate — break the middle line so it breathes.",
      ["D−27 11:30", "dana", "Split the line around her cigarette beat."],
      "D−26 10:20",
    ),
    addressedThread(
      "D−30 11:20",
      "leo",
      page(44),
      "The child singing a beat late got the biggest laugh in the room — keep it clean.",
      ["D−27 12:00", "dana", "Cleared the line before it so it lands solo."],
      "D−26 10:25",
    ),
    addressedThread(
      "D−30 13:05",
      "dana",
      page(66),
      "Trim one overlap on the eleventh-floor landing so Jane's pause lands.",
      [
        "D−27 14:15",
        "dana",
        "Cut the repeated line and held on the candle going out.",
      ],
      "D−25 11:00",
    ),
    addressedThread(
      "D−30 14:10",
      "leo",
      page(90),
      "Make sure Lewis's relay counts match the floor numbers Jane calls.",
      ["D−27 15:00", "dana", "Checked every count from ten down to nine."],
      "D−25 11:15",
    ),
    addressedThread(
      "D−30 15:00",
      "dana",
      page(112),
      "End clean on Jane pressing the call button and taking the stairs.",
      [
        "D−27 16:00",
        "dana",
        "Cut the final line after the button glows green.",
      ],
      "D−25 11:30",
    ),
  ]);
