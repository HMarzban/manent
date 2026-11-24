// Open comment threads for Ward Nine (23: 7 in 406's Network round + 16), Larch Road (12) and Moss & Pebble (30).
import { groupThreads } from "./film-threads.ts";
import type { HeavyThreadSpec, ThreadTuple } from "./film-threads.ts";

/** Ward Nine 406 Bed Seven: 7 open threads in its Network round (after the D−2 22:15 send). */
export const WARD_NINE_406_ROUND_THREADS: readonly ThreadTuple[] =
  Object.freeze([
    [
      "D−1 09:15",
      "ayesha-qureshi",
      "Trim the opening handover by half a page so we reach Bed Seven before the break.",
    ],
    [
      "D−1 10:30",
      "ama-asiedu",
      "Audrey's pause at the relatives' room door lands well; let her stay silent a beat longer.",
    ],
    [
      "D−1 11:45",
      "dana",
      "Make sure Omar's second call hints at the out-of-city application without giving it away.",
    ],
    [
      "D−1 13:00",
      "ayesha-qureshi",
      "Bea's obs chart exchange with Tayo needs a clearer clinical stake for the audience.",
    ],
    [
      "D−1 14:20",
      "rhys-trevenna",
      "Clearance check on the ward noticeboard signage and the consultant's surname.",
    ],
    [
      "D−1 15:40",
      "ama-asiedu",
      "Bringing back Mick's tea trolley scene works nicely; bridge the corridor cut cleanly.",
    ],
    [
      "D−1 16:50",
      "dana",
      "Tighten the final dawn bus beat so Ella's line carries the episode out.",
    ],
  ]);

/** Open threads on Ward Nine (excluding 406's 7) and Larch Road: 28 open threads. */
export const DRAMA_AND_COMEDY_OPEN_THREADS: readonly HeavyThreadSpec[] =
  Object.freeze([
    ...groupThreads("heavy/h24/404", [
      [
        "D−5 10:30",
        "ama-asiedu",
        "Keep the Pink corridor cut lean so the lift lobby tension holds.",
      ],
      [
        "D−4 14:15",
        "rhys-trevenna",
        "Clear the ward chart label shown on the side-room trolley.",
      ],
      [
        "D−3 16:00",
        "dana",
        "Check Audrey's closing exchange with Tayo against 405's opening beat.",
      ],
    ]),
    ...groupThreads("heavy/h24/405", [
      [
        "D−5 11:00",
        "ayesha-qureshi",
        "Visiting Hours hits its stride early; tighten the middle bay two dialogue.",
      ],
      [
        "D−4 13:20",
        "ama-asiedu",
        "Confirm the Blue page additions keep the runtime under fifty-eight pages.",
      ],
      [
        "D−3 15:10",
        "declan-furey",
        "Flag Omar's bleep timing so it matches the service lift arrival.",
      ],
      [
        "D−2 12:00",
        "dana",
        "Hold the beat where Bea closes her notebook without writing down the rumour.",
      ],
    ]),
    ...groupThreads("heavy/h24/407", [
      [
        "D−6 09:50",
        "ayesha-qureshi",
        "Second Opinion's diagnostic mystery works well; sharpen the consultant's entry.",
      ],
      [
        "D−5 14:40",
        "ama-asiedu",
        "Give Mick one beat in the back stairs scene to ground the shift change.",
      ],
      [
        "D−4 11:15",
        "dana",
        "Trim one page from the treatment room scene so we stay close to target.",
      ],
      [
        "D−3 16:25",
        "declan-furey",
        "Align Ella's night bus dialogue with the weather report from 406.",
      ],
      [
        "D−2 10:45",
        "rhys-trevenna",
        "Check the dosage phrasing with the clinical adviser before Network draft.",
      ],
    ]),
    ...groupThreads("heavy/h24/408", [
      [
        "D−4 10:00",
        "dana",
        "Lights Out has a strong cold open; let the dynamo hum carry the silence.",
      ],
      [
        "D−3 13:35",
        "ama-asiedu",
        "Check Tayo's conversation with Audrey so it builds cleanly into 409.",
      ],
      [
        "D−2 15:20",
        "ayesha-qureshi",
        "Can Bea take the lead in bay one while Omar is stuck downstairs?",
      ],
      [
        "D−1 11:10",
        "declan-furey",
        "Check the page count after the new sluice-room scene goes in.",
      ],
    ]),
    ...groupThreads("heavy/h25/305", [
      [
        "D−3 10:20",
        "ama-asiedu",
        "The dual-dialogue row in scene C plays fast; keep Des and Priti on separate rhythms.",
      ],
      [
        "D−2 14:10",
        "ayesha-qureshi",
        "Nana June's cake reveal lands better if Molly spots the wrong candles first.",
      ],
      [
        "D−1 11:30",
        "dana",
        "Tighten Gerald's fence button by one line before the studio audience run.",
      ],
      [
        "D−1 16:15",
        "arjun-mehra",
        "Confirm Kai's stair entrance leaves enough room for the applause break.",
      ],
    ]),
    ...groupThreads("heavy/h25/306", [
      [
        "D−4 10:45",
        "ama-asiedu",
        "Des panicking under the kitchen sink needs one earlier visual setup.",
      ],
      [
        "D−3 13:15",
        "ayesha-qureshi",
        "Keep Priti's timetable joke running through the second act turn.",
      ],
      [
        "D−2 15:50",
        "dana",
        "Gerald's offer of a bucket should land right before the ceiling drips.",
      ],
      [
        "D−1 12:10",
        "arjun-mehra",
        "Cut the repeat explanation in the lounge so we hit the tag faster.",
      ],
    ]),
    ...groupThreads("heavy/h25/307", [
      [
        "D−4 11:20",
        "dana",
        "Des staying calm in the car while panicking over breakfast is the core joke; lean in.",
      ],
      [
        "D−3 14:30",
        "ama-asiedu",
        "Give Molly a sharper payoff on the mirror-signal-manoeuvre checklist.",
      ],
      [
        "D−2 16:05",
        "ayesha-qureshi",
        "Nana June's back-seat directions could build one beat higher.",
      ],
      [
        "D−1 10:50",
        "arjun-mehra",
        "Check the garden exit cues for camera two before Table draft.",
      ],
    ]),
  ]);

/** Open threads on Moss & Pebble (30 open: 12 pickup notes from Kenji Arakawa on 216 + 18 across 215, 217–224). */
export const ANIMATION_OPEN_THREADS: readonly HeavyThreadSpec[] = Object.freeze(
  [
    ...groupThreads("heavy/h26/216", [
      [
        "D−4 09:30",
        "kenji-arakawa",
        "Pickup 1: brighter tempo on Zip's opening buzz-in across the reeds.",
      ],
      [
        "D−4 09:45",
        "kenji-arakawa",
        "Pickup 2: soften Moss's first 'Oh, Pebble' so it sounds fond rather than cross.",
      ],
      [
        "D−4 10:00",
        "kenji-arakawa",
        "Pickup 3: leave a half-second beat before Pebble's slow reply.",
      ],
      [
        "D−4 10:15",
        "kenji-arakawa",
        "Pickup 4: clearer consonant on 'stepping stones' for preschool clarity.",
      ],
      [
        "D−4 10:30",
        "kenji-arakawa",
        "Pickup 5: Old Newt's chuckle needs a gentler lift at the end of the line.",
      ],
      [
        "D−4 10:45",
        "kenji-arakawa",
        "Pickup 6: Zip's counting line ran slightly fast; take one slower pass.",
      ],
      [
        "D−3 09:30",
        "kenji-arakawa",
        "Pickup 7: warm up Mrs. Hartley's off-screen garden call.",
      ],
      [
        "D−3 09:50",
        "kenji-arakawa",
        "Pickup 8: separate the splash cue from Moss's gasp on the lily pad.",
      ],
      [
        "D−3 10:10",
        "kenji-arakawa",
        "Pickup 9: give the Heron a polite pause before offering his wing.",
      ],
      [
        "D−3 10:30",
        "kenji-arakawa",
        "Pickup 10: match Pebble's rolling hum to the earlier animatic pitch.",
      ],
      [
        "D−3 10:50",
        "kenji-arakawa",
        "Pickup 11: trim the breath on Zip's final landing line.",
      ],
      [
        "D−3 11:10",
        "kenji-arakawa",
        "Pickup 12: record one extra quiet 'Oh, Pebble' alt for the closing beat.",
      ],
    ]),
    ...groupThreads("heavy/h26/215", [
      [
        "D−3 13:00",
        "kenji-arakawa",
        "Keep Moss's upside-down reflection line playful for the record session.",
      ],
      [
        "D−2 14:20",
        "ayesha-qureshi",
        "Lovely visual gag with the pond ripples; ready for the record session.",
      ],
    ]),
    ...groupThreads("heavy/h26/217", [
      [
        "D−3 13:40",
        "kenji-arakawa",
        "Drop the volume slightly for the moonlight whisper sequence.",
      ],
      [
        "D−2 15:00",
        "gwen-treharne",
        "Confirm numbered dialogue lines match the booth sheet.",
      ],
    ]),
    ...groupThreads("heavy/h26/218", [
      [
        "D−3 14:15",
        "kenji-arakawa",
        "Check the overlap between Zip and Moss at the flowerpot shadow.",
      ],
      [
        "D−2 15:30",
        "jiahui-wen",
        "Keep Pebble's shadow joke simple so the youngest viewers follow it.",
      ],
    ]),
    ...groupThreads("heavy/h26/219", [
      [
        "D−3 14:50",
        "kenji-arakawa",
        "Give the wobble sound effect room before Moss speaks.",
      ],
      [
        "D−2 16:10",
        "ayesha-qureshi",
        "The Heron's balance tip is charming; hold that beat.",
      ],
    ]),
    ...groupThreads("heavy/h26/220", [
      [
        "D−3 15:20",
        "kenji-arakawa",
        "Keep Moss's apology sincere and unhurried.",
      ],
      [
        "D−2 16:40",
        "gwen-treharne",
        "Final line-count check complete ahead of D+3 recording.",
      ],
    ]),
    ...groupThreads("heavy/h26/221", [
      [
        "D−3 10:15",
        "ayesha-qureshi",
        "Keep the bubble race to three clear tries before Pebble wins by waiting.",
      ],
      [
        "D−2 11:30",
        "jiahui-wen",
        "Trim one exchange by the reeds so the episode stays right on eleven minutes.",
      ],
    ]),
    ...groupThreads("heavy/h26/222", [
      [
        "D−3 11:00",
        "ayesha-qureshi",
        "Let the visiting ducks sound cheerful rather than bossy.",
      ],
      [
        "D−2 12:15",
        "gwen-treharne",
        "Flag the extra duckling voices for casting ahead of Record.",
      ],
    ]),
    ...groupThreads("heavy/h26/223", [
      [
        "D−3 11:45",
        "ayesha-qureshi",
        "Zip struggling to stay quiet is great; give him one funny tiny buzz.",
      ],
      [
        "D−2 13:05",
        "jiahui-wen",
        "Make sure Old Newt gets the closing quiet beat.",
      ],
    ]),
    ...groupThreads("heavy/h26/224", [
      [
        "D−3 12:30",
        "ayesha-qureshi",
        "Lovely evening mood; check the lantern-light description for the board artists.",
      ],
      [
        "D−2 13:45",
        "gwen-treharne",
        "Confirm the character list before moving to Record.",
      ],
    ]),
  ],
);
