// Ward Nine's upcoming Season 5 board (storylines and cards) and three episode outlines.
import type {
  SeedBoardCard,
  SeedBoardStoryline,
} from "../../seed/capabilities/series.ts";

export interface OutlineBeatSpec {
  readonly heading: string;
  readonly synopsis: string;
}

export const WARD_NINE_S5_STORYLINES: readonly SeedBoardStoryline[] =
  Object.freeze([
    { id: "sl-audrey", title: "Audrey's final year on the ward" },
    { id: "sl-tayo", title: "Tayo stepping up to charge nurse" },
    { id: "sl-intake", title: "Bea mentoring the new junior intake" },
  ]);

export const WARD_NINE_S5_CARDS: readonly SeedBoardCard[] = Object.freeze([
  {
    id: "c-501-a",
    storylineId: "sl-audrey",
    episodeId: "ep-501",
    text: "Audrey returns from leave and notices the rota board has been redrawn without her.",
    linkBlockId: null,
  },
  {
    id: "c-501-b",
    storylineId: "sl-tayo",
    episodeId: "ep-501",
    text: "Tayo runs the midnight handover cleanly until a transfer from surgery arrives unannounced.",
    linkBlockId: null,
  },
  {
    id: "c-501-c",
    storylineId: "sl-intake",
    episodeId: "ep-501",
    text: "Bea hands her spare clipboard to a nervous first-night doctor outside bay one.",
    linkBlockId: null,
  },
  {
    id: "c-502-a",
    storylineId: "sl-audrey",
    episodeId: "ep-502",
    text: "Audrey covers a short-staffed shift and realises she cannot stay out of the bays.",
    linkBlockId: null,
  },
  {
    id: "c-502-b",
    storylineId: "sl-tayo",
    episodeId: "ep-502",
    text: "Tayo challenges the bed manager over an unsafe night move.",
    linkBlockId: null,
  },
  {
    id: "c-503-a",
    storylineId: "sl-audrey",
    episodeId: "ep-503",
    text: "A winter fog fills Lannick General; Audrey and Tayo split the floor in two.",
    linkBlockId: null,
  },
  {
    id: "c-503-b",
    storylineId: "sl-intake",
    episodeId: "ep-503",
    text: "Bea makes her first solo call on a side-room admission before Omar reaches the stairs.",
    linkBlockId: null,
  },
]);

export const WARD_NINE_S5_OUTLINES: Readonly<
  Record<string, readonly OutlineBeatSpec[]>
> = Object.freeze({
  "heavy/h24/501": [
    {
      heading: "INT. WARD NINE - NURSES' STATION - EVENING",
      synopsis:
        "Audrey starts her twentieth autumn on Ward Nine and finds Tayo's new handover sheet pinned over hers.",
    },
    {
      heading: "INT. WARD NINE - BAY ONE - NIGHT",
      synopsis:
        "Bea introduces the new junior doctor to the bay routine while Mick brings up two late admissions.",
    },
    {
      heading: "INT. WARD NINE - RELATIVES' ROOM - NIGHT",
      synopsis:
        "Tayo sits with a family waiting for a consultant who is delayed downstairs.",
    },
    {
      heading: "EXT. LANNICK GENERAL - BUS STOP - DAWN",
      synopsis:
        "Ella hums on the first bus home while Audrey tells Tayo the ward will need a formal deputy by spring.",
    },
  ],
  "heavy/h24/502": [
    {
      heading: "INT. WARD NINE - LIFT LOBBY - EVENING",
      synopsis:
        "Two agency nurses cancel at eight; Audrey calls in relief cover from the seventh floor.",
    },
    {
      heading: "INT. WARD NINE - CORRIDOR - NIGHT",
      synopsis:
        "Tayo argues with the bed manager over keeping bay two clear for an incoming cardiology patient.",
    },
    {
      heading: "INT. WARD NINE - TREATMENT ROOM - NIGHT",
      synopsis:
        "Omar and Bea catch a quiet medication discrepancy before the midnight drug round.",
    },
  ],
  "heavy/h24/503": [
    {
      heading: "INT. WARD NINE - NURSES' STATION - NIGHT",
      synopsis:
        "Coastal fog diverts ambulances across Lannick; the ninth floor opens its last side room.",
    },
    {
      heading: "INT. WARD NINE - SIDE ROOM - NIGHT",
      synopsis:
        "Bea stabilises a breathless patient on her own while Omar is tied up in bay one.",
    },
    {
      heading: "INT. WARD NINE - STAFF ROOM - DAWN",
      synopsis:
        "Mick pours tea for the whole shift; Audrey leaves the keys on Tayo's side of the desk.",
    },
  ],
});
