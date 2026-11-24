// Harbour Lights 206 The Bar: four acts and 31 beats with synopses for its outline document.

export interface OutlineBeatSeed {
  readonly title: string;
  readonly synopsis: string;
}

export interface OutlineActSeed {
  readonly heading: string;
  readonly beats: readonly OutlineBeatSeed[];
}

export const HARBOUR_LIGHTS_206_OUTLINE: readonly OutlineActSeed[] =
  Object.freeze([
    {
      heading: "ACT ONE",
      beats: [
        {
          title: "The hearing is moved to tomorrow",
          synopsis:
            "A mainland message brings the licence hearing forward by a day, leaving Ida with one crossing left before dawn.",
        },
        {
          title: "Maren reads the notice twice",
          synopsis:
            "In the terminal office Maren checks the timestamp and realises there is no morning sailing early enough to reach the room.",
        },
        {
          title: "No crossing in this wind",
          synopsis:
            "Gale gusts sweep the harbour mouth; even the harbourmaster's board marks the evening ferries suspended.",
        },
        {
          title: "Elspeth Dray asks for a lift",
          synopsis:
            "Stranded on Wrenna with her report due in the morning, Elspeth quietly asks Ida whether the Marguerite can still run.",
        },
        {
          title: "Pike says the port shaft will hold",
          synopsis:
            "In the engine room Pike checks the bearings by hand and gives Ida four hours of careful running, not a knot more.",
        },
        {
          title: "Nora shuts the café early",
          synopsis:
            "Nora turns the door sign, packs flasks for the crossing and tells Ida the island is coming with her if it has to.",
        },
        {
          title: "Arne remembers the Bar at night",
          synopsis:
            "At the boatyard Arne lays out the old soundings chart and warns Ida that the night tide cuts across the Bar faster than she thinks.",
        },
        {
          title: "Ida says she'll take her over",
          synopsis:
            "Standing on the slip in the rain, Ida makes the call: if the mainland wants a hearing, she will bring the ferry to its door.",
        },
      ],
    },
    {
      heading: "ACT TWO",
      beats: [
        {
          title: "Loading in the dark",
          synopsis:
            "Only essential vehicles roll onto the car deck under a single floodlight while Maren checks the manifest against the wind.",
        },
        {
          title: "Finn in the bread van again",
          synopsis:
            "Checking the tie-downs, Cal hears a cough behind the stacked crates and finds Finn curled inside the bread van once more.",
        },
        {
          title: "Cal on the ramp chain",
          synopsis:
            "Cal hauls the ramp chain clear in driving spray, steady with the ropes for the first time since he came home.",
        },
        {
          title: "One hour of water, by the tide table",
          synopsis:
            "Maren hands Ida the marked tide table: they have sixty minutes of depth over the Bar before the ebb traps them outside.",
        },
        {
          title: "Elspeth's notebook on the lounge bench",
          synopsis:
            "Sitting alone in the swaying passenger lounge, Elspeth opens her notebook to the blank final page and watches the crew work.",
        },
        {
          title: "Off the slip with no deck lights",
          synopsis:
            "Ida kills the deck floods so she can read the harbour water, easing the Marguerite stern-first into the dark.",
        },
        {
          title: "Four fathoms on the sounder",
          synopsis:
            "Cal takes his station beside the sounder and calls four fathoms twice, matching Ida's cadence from the fog crossing.",
        },
        {
          title: "Pike's engine, Pike's rules",
          synopsis:
            "Below decks the port shaft shudders against the swell; Pike answers Ida's telegraph with a calm hand on the oil feed.",
        },
      ],
    },
    {
      heading: "ACT THREE",
      beats: [
        {
          title: "The East Channel in the rain",
          synopsis:
            "Rain flattens the radar return as the ferry enters the East Channel where Arne dredged ten years ago.",
        },
        {
          title: "Three fathoms, then two",
          synopsis:
            "The sounder drops from three fathoms to two; every face in the wheelhouse turns toward the glass.",
        },
        {
          title: "Cal reads the marks wrong",
          synopsis:
            "Blinded by spray on the side glass, Cal calls the outer buoy a boat length east and pulls Ida off the channel line.",
        },
        {
          title: "Arne on the radio",
          synopsis:
            "From the boatyard VHF Arne's voice breaks through the static, talking Ida back onto the old leading marks from memory.",
        },
        {
          title: "Ida cuts the engines",
          synopsis:
            "With shoal water under the keel, Ida cuts both engines dead and lets the wheelhouse go silent so she can hear the Bar.",
        },
        {
          title: "Drifting in on the flood",
          synopsis:
            "The Marguerite rides the last lift of the tide across the shoal, inches off the gravel, while Pike holds his breath below.",
        },
        {
          title: "Elspeth puts the notebook away",
          synopsis:
            "Steady on her feet in the companionway, Elspeth snaps her notebook shut and slips it deep into her green coat.",
        },
        {
          title: "Over the Bar",
          synopsis:
            "Deep water returns under the hull; Ida brings the engines back up and the mainland harbour lights open ahead.",
        },
      ],
    },
    {
      heading: "ACT FOUR",
      beats: [
        {
          title: "Ardle slip at first light",
          synopsis:
            "The Marguerite nudges the Ardle slip as dawn breaks; Pike climbs onto the deck with grease to his elbows and nods once.",
        },
        {
          title: "Mr. Brack holds the door",
          synopsis:
            "Outside the civic hall Mr. Brack meets Nora on the steps, quietly handing her an extension letter on the café's overdraft.",
        },
        {
          title: "The hearing room",
          synopsis:
            "Ida, Maren and Cal take their seats across from the mainland board, salt still crusted on their coats.",
        },
        {
          title: "Maren's tide table as evidence",
          synopsis:
            "Maren lays five years of hand-marked tide tables and crossing logs across the table, proving the island's lifeline in ink.",
        },
        {
          title: "Elspeth's report",
          synopsis:
            "Elspeth steps forward and reads the entry she wrote at first light: a boat that crosses when no mainland contractor will.",
        },
        {
          title: "One more year",
          synopsis:
            "The chair grants a twelve-month renewal pending the engine refit; nobody cheers, and Ida lets out a breath she has held all week.",
        },
        {
          title: "The crossing home",
          synopsis:
            "Back on the Ardle slip the morning queue rolls aboard, Finn waves from the wheelhouse window, and Ida sounds the horn for Wrenna.",
        },
      ],
    },
  ]);
