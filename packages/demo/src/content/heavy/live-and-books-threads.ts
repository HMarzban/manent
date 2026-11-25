// Open comment threads for Live, Audio, Books & Games (H30, H31, H32, H34 and H35: 32 open threads; 0 on H33 and H36).
import { groupThreads } from "./film-threads.ts";
import type { HeavyThreadSpec } from "./film-threads.ts";

export const LIVE_AND_BOOKS_OPEN_THREADS: readonly HeavyThreadSpec[] =
  Object.freeze([
    ...groupThreads("heavy/h30/segments/10", [
      [
        "D 10:30",
        "hugo-marchetti",
        "Keep the Tolle Exchange library phone-in cue tight so Bertie hits the weather link on time.",
      ],
      [
        "D 12:15",
        "zainab-kamara",
        "Added a short Walter Fenn umbrella tag for the closing toss.",
      ],
    ]),
    ...groupThreads("heavy/h30/segments/11", [
      [
        "D−1 15:10",
        "hugo-marchetti",
        "Confirm the Exchange Square outside-broadcast link duration.",
      ],
      [
        "D 11:00",
        "zainab-kamara",
        "Trim Bertie's intro to the night market stalls by fifteen seconds.",
      ],
    ]),
    ...groupThreads("heavy/h30/segments/12", [
      [
        "D−1 16:00",
        "hugo-marchetti",
        "Check Gull Point lighthouse sound cues with the field producer.",
      ],
      [
        "D 11:45",
        "zainab-kamara",
        "Hold room for Esme Tull's recollection before the ribbon-cutting.",
      ],
    ]),
    ...groupThreads("heavy/h31/stories/15", [
      [
        "D 09:45",
        "nadia-petrenko",
        "Keep the midday council preview strictly neutral ahead of the afternoon vote.",
      ],
      [
        "D 10:20",
        "joaquin-ibarra",
        "Trim the Mercer Street background paragraph to twenty seconds.",
      ],
    ]),
    ...groupThreads("heavy/h31/stories/16", [
      [
        "D 15:30",
        "nadia-petrenko",
        "Update the clerk's vote count to thirty-one to eight with one abstention.",
      ],
      [
        "D 16:05",
        "joaquin-ibarra",
        "Confirm Yara's studio toss into the Exchange Square live report.",
      ],
    ]),
    ...groupThreads("heavy/h31/stories/17", [
      [
        "D 14:10",
        "nadia-petrenko",
        "Hold the night market trader quote for tomorrow's 13:00 lead.",
      ],
      [
        "D 14:50",
        "joaquin-ibarra",
        "Check the stall count with the city licensing office in the morning.",
      ],
    ]),
    ...groupThreads("heavy/h32/ep57", [
      [
        "D−5 11:20",
        "greta-sorensen",
        "Clean up the harbour bell ambience cue under Anil's bridge.",
      ],
      [
        "D−4 14:15",
        "juniper-cobb",
        "Verified the pilot cutter launch year against the Ardle Quay log.",
      ],
    ]),
    ...groupThreads("heavy/h32/ep58", [
      [
        "D−4 10:40",
        "greta-sorensen",
        "Shorten the tide-table explanation so the episode sits right on thirty-one thirty.",
      ],
      [
        "D−3 15:05",
        "anil-bhattacharya",
        "Keep the fisherman's silence after the sandbank story intact.",
      ],
    ]),
    ...groupThreads("heavy/h32/ep59", [
      [
        "D−3 11:10",
        "greta-sorensen",
        "We are still eight minutes under target; expand the lighthouse keeper conversation.",
      ],
      [
        "D−2 13:25",
        "juniper-cobb",
        "Added the fog-horn log excerpt from thirty years ago.",
      ],
      [
        "D−2 16:10",
        "anil-bhattacharya",
        "Check the transition out of the Gull Point soundscape.",
      ],
      [
        "D−1 10:30",
        "greta-sorensen",
        "Hold a two-minute slot at the end to tee up episode sixty.",
      ],
    ]),
    ...groupThreads("heavy/h34/manuscript", [
      [
        "D−7 10:15",
        "delphine-moreau-kaye",
        "Keep Candlemere's clocktower flame description consistent between chapters two and twelve.",
      ],
      [
        "D−6 14:20",
        "ottilie-brandt",
        "Standardise capitalising 'the Guild' and 'the Hours' throughout the book.",
      ],
      [
        "D−5 11:05",
        "delphine-moreau-kaye",
        "Give Maud Ashby one more quiet beat on the Fourth Ward ladder before Ned leaves.",
      ],
      [
        "D−4 15:30",
        "ottilie-brandt",
        "Trim the repeated 'suddenly' across the glassworks chapter.",
      ],
      [
        "D−3 10:50",
        "delphine-moreau-kaye",
        "Check the timeline of Old Wick's expulsion so it matches sixty years ago.",
      ],
      [
        "D−2 16:15",
        "ottilie-brandt",
        "Query on the comma splice in Hattie's breath-counting passage.",
      ],
    ]),
    ...groupThreads("heavy/h35/script", [
      [
        "D−6 11:00",
        "marisol-etxeberria",
        "Keep Ilse's bridge barks consistent with the film's quiet, spare register.",
      ],
      [
        "D−5 14:30",
        "luca-ferrandi",
        "Flag the conditional choice in chapter two for the next weekly line-data export.",
      ],
      [
        "D−4 10:45",
        "benedikt-auer",
        "Trim Temba's salvage inspection branch so the camera cut doesn't stall.",
      ],
      [
        "D−3 15:15",
        "marisol-etxeberria",
        "Check Ardent's status response when the player inspects the mass budget twice.",
      ],
      [
        "D−2 12:20",
        "luca-ferrandi",
        "Confirm the engine direction tag on the Long Patience airlock sequence.",
      ],
      [
        "D−1 16:40",
        "benedikt-auer",
        "Keep Niko's relay message locked behind the third waypoint flag.",
      ],
    ]),
  ]);
