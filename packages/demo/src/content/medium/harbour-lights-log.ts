// Harbour Lights 205 Slack Water: 41 tagged room log entries (landed, showrunner, joke, future).

export type RoomLogSeedTag = "landed" | "showrunner" | "joke" | "future";

export interface RoomLogSeedEntry {
  readonly text: string;
  readonly tags: readonly RoomLogSeedTag[];
  /** 1-based scene number in 205 Slack Water when linked to a scene heading; null otherwise. */
  readonly scene: number | null;
}

/** 41 room log entries from the writers' room break of 205 Slack Water. */
export const HARBOUR_LIGHTS_205_ROOM_LOG: readonly RoomLogSeedEntry[] =
  Object.freeze([
    {
      text: "Open straight on Finn at the café counter eating three breakfasts in silence.",
      tags: ["landed"],
      scene: 1,
    },
    {
      text: "Nora asks zero questions while he eats — she knows a hungry kid runs if you crowd him.",
      tags: ["showrunner"],
      scene: 1,
    },
    {
      text: "Alt gag: Nora slides a fourth plate of toast without looking up; he doesn't blink.",
      tags: ["joke"],
      scene: 1,
    },
    {
      text: "Maren wants a name for the manifest before midday; Ida stalls without admitting why.",
      tags: ["landed"],
      scene: 2,
    },
    {
      text: "Keep Maren practical rather than stern — she's protecting the licence, not picking on a boy.",
      tags: ["showrunner"],
      scene: 2,
    },
    {
      text: "Bread van driver asleep in his cab on the slip, swearing he counted twelve trays and zero boys.",
      tags: ["landed"],
      scene: 3,
    },
    {
      text: "Driver line: 'If I'd brought a boy I'd have charged him for the seat.'",
      tags: ["joke"],
      scene: 3,
    },
    {
      text: "Scene 4: Finn is already back down in the engine room with Pike before anyone misses him.",
      tags: ["landed"],
      scene: 4,
    },
    {
      text: "Plant the Marguerite's engine quirks here so Pike's promise in 206 feels earned.",
      tags: ["future"],
      scene: 4,
    },
    {
      text: "Elspeth takes the window table in Hollis Kitchen and asks Nora what the island does without the boat.",
      tags: ["landed"],
      scene: 5,
    },
    {
      text: "Dana: don't tip Elspeth's job too early in scene 5 — she should read like a quiet tourist with sharp ears.",
      tags: ["showrunner"],
      scene: 5,
    },
    {
      text: "Ida tells Cal in the wheelhouse that Finn can't stay aboard, then immediately gives three reasons he might.",
      tags: ["landed"],
      scene: 6,
    },
    {
      text: "Keep both pitched alternates on Ida's wheelhouse speech so Dana can pick in the table pass.",
      tags: ["showrunner"],
      scene: 6,
    },
    {
      text: "Cal line: 'That's a very long speech for someone who just said no.'",
      tags: ["joke"],
      scene: 6,
    },
    {
      text: "Maren pins a lost-child notice on the terminal board; Ida takes it down and rewrites it softer.",
      tags: ["landed"],
      scene: 7,
    },
    {
      text: "Dana wants a tighter beat on Ida's speech in scene 7 before Sam hands in his private draft.",
      tags: ["showrunner"],
      scene: 7,
    },
    {
      text: "Arne catches Finn turning a rusty boatyard winch and teaches him the right grip without a lecture.",
      tags: ["landed"],
      scene: 8,
    },
    {
      text: "Echo this boatyard bond in 206 when Arne radios Ida across the Bar.",
      tags: ["future"],
      scene: 8,
    },
    {
      text: "Cal spots the green coat stepping out of the terminal with a small camera.",
      tags: ["landed"],
      scene: 9,
    },
    {
      text: "Cal trying to look casual while tailing someone on a hundred-yard slipway.",
      tags: ["joke"],
      scene: 9,
    },
    {
      text: "Noon crossing: Elspeth photographs the life jacket lockers; Cal sits right opposite her.",
      tags: ["landed"],
      scene: 10,
    },
    {
      text: "Keep Elspeth polite and unreadable — she never lies, she just answers a narrower question.",
      tags: ["showrunner"],
      scene: 10,
    },
    {
      text: "Hold the detail about the rusty latch on locker four for the 206 hearing room.",
      tags: ["future"],
      scene: 10,
    },
    {
      text: "Arne in Hollis Kitchen: knew she was mainland by the way she folded her ticket.",
      tags: ["landed"],
      scene: 11,
    },
    {
      text: "Arne line: 'Islanders put a ticket in their pocket. Mainland folk hold it till the ramp's down.'",
      tags: ["joke"],
      scene: 11,
    },
    {
      text: "Finn lets slip his father worked a bigger boat on the mainland — stop there, don't explain more.",
      tags: ["landed", "showrunner"],
      scene: 12,
    },
    {
      text: "Save Finn's surname and mainland address for season three if we want it.",
      tags: ["future"],
      scene: 12,
    },
    {
      text: "Elspeth asks Maren for the tide table and the fog crossing log; Maren hands both over cleanly.",
      tags: ["landed"],
      scene: 13,
    },
    {
      text: "Maren refuses to hide the log — honesty is her whole case when the hearing arrives.",
      tags: ["showrunner"],
      scene: 13,
    },
    {
      text: "Act Two turn on the slip: Elspeth gives Ida her real name and title.",
      tags: ["landed"],
      scene: 14,
    },
    {
      text: "Make sure Elspeth mentions she was aboard the first crossing after the fog — ties straight back to 204.",
      tags: ["showrunner"],
      scene: 14,
    },
    {
      text: "Pike's only question when Ida tells the crew: 'Did she count the cars or the people?'",
      tags: ["landed", "joke"],
      scene: 15,
    },
    {
      text: "Nora finally tells Ida aloud that the café cannot survive another quiet stretch without the ferry.",
      tags: ["landed"],
      scene: 16,
    },
    {
      text: "Keep Nora dry-eyed; she says it while stacking cups, not across a table.",
      tags: ["showrunner"],
      scene: 16,
    },
    {
      text: "Finn asleep in the boatyard office; Arne says he reminds him of someone who left at nineteen.",
      tags: ["landed"],
      scene: 17,
    },
    {
      text: "Callback for 206: Arne's apology to Cal stays unspoken until the night crossing.",
      tags: ["future"],
      scene: 17,
    },
    {
      text: "Elspeth returns the log with written questions on the night crossing; Maren answers every line.",
      tags: ["landed"],
      scene: 18,
    },
    {
      text: "Cal reads the stowaway entry in Elspeth's notebook on the lounge bench.",
      tags: ["landed"],
      scene: 19,
    },
    {
      text: "Elspeth catches Cal on the car deck: 'The report is honest, which is worse.'",
      tags: ["landed", "showrunner"],
      scene: 20,
    },
    {
      text: "Cal tells Ida on the slip; Ida says she would have written the same report herself.",
      tags: ["landed"],
      scene: 21,
    },
    {
      text: "Tag at slack water: Pike lets Finn sit up with the engines and Ida writes his first name in the log.",
      tags: ["landed", "future"],
      scene: 22,
    },
  ]);
