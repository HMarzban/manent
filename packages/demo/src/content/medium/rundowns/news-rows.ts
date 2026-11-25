// Lannick One News rundown rows for today's broadcast and next week's planned broadcast.

export type NewsRowSpec =
  | { readonly kind: "header"; readonly title: string }
  | {
      readonly kind: "item";
      readonly story: string;
      readonly presenter: string | null;
      readonly type: string;
      readonly durMs: number;
      readonly unnumbered: boolean;
    }
  | {
      readonly kind: "script";
      readonly rowKey: string;
      readonly docKey: string;
      readonly story: string;
      readonly presenter: string | null;
      readonly type: string;
    };

const dur = (minutes: number, seconds: number): number =>
  (minutes * 60 + seconds) * 1000;

const story = (
  rowKey: string,
  title: string,
  presenter: string,
  type: string,
): NewsRowSpec => ({
  kind: "script",
  rowKey,
  docKey: `medium/lannick-one-news/stories/${rowKey}`,
  story: title,
  presenter,
  type,
});

export const NEWS_TARGET_MS = dur(59, 30);

export const NEWS_DAY_ROWS: readonly NewsRowSpec[] = Object.freeze([
  { kind: "header", title: "OPEN" },
  {
    kind: "item",
    story: "Open: titles and headlines",
    presenter: "Grace, Owen",
    type: "ANC/VT",
    durMs: dur(1, 10),
    unnumbered: true,
  },
  { kind: "header", title: "PART ONE — THE CITY" },
  story(
    "01",
    "Tolle Exchange library: council votes yes",
    "Grace / Lund",
    "ANC + PKG",
  ),
  story("02", "Library: what happens to Mercer Street", "Grace", "READER"),
  story("03", "Library: voices from Exchange Square", "Grace", "VOX"),
  story(
    "04",
    "Tram line 3 extension: first-week passenger figures",
    "Owen",
    "READER + GFX",
  ),
  story("05", "Halse Road roadworks extended by two weeks", "Owen", "READER"),
  story(
    "06",
    "Tolle Bridge to close overnight for resurfacing",
    "Owen",
    "READER + GFX",
  ),
  story(
    "07",
    "Gale warning: Wrenna ferries cancelled after eight",
    "Owen",
    "ANC + GFX + SOT",
  ),
  story("08", "Gale: what to expect on the roads", "Owen", "READER + GFX"),
  story("09", "Flood boards go up at Ardle Quay", "Owen", "VO"),
  { kind: "header", title: "PART TWO — AROUND LANNICK" },
  story(
    "10",
    "Lannick General car park charges to be reviewed",
    "Grace",
    "READER",
  ),
  story(
    "11",
    "New school meals menu trialled in twelve primaries",
    "Grace / Adewale",
    "PKG",
  ),
  story(
    "12",
    "Bus timetable app outage: operator apologises",
    "Owen",
    "READER",
  ),
  story("13", "Forty new tram drivers to start training", "Owen", "VO + SOT"),
  story("14", "Water main replacement on Linnet Street", "Owen", "READER"),
  story(
    "15",
    "Night market opens tomorrow on Exchange Square",
    "Grace / Lund",
    "PKG",
  ),
  story("16", "Gull Point lighthouse museum to reopen", "Grace", "VO"),
  story("17", "Ardle fish market changes its opening hours", "Owen", "READER"),
  story(
    "18",
    "140 homes approved on the old dye works site",
    "Grace",
    "READER + GFX",
  ),
  story(
    "19",
    "Coast line: engineering works next week",
    "Owen",
    "READER + GFX",
  ),
  story(
    "20",
    "Animal shelter appeals for foster homes",
    "Grace / Adewale",
    "PKG",
  ),
  {
    kind: "item",
    story: "Break 1 (commercials)",
    presenter: null,
    type: "BREAK",
    durMs: dur(5, 30),
    unnumbered: true,
  },
  { kind: "header", title: "PART THREE — THE COUNTRY" },
  story("21", "New rules for e-scooter hire come into force", "Owen", "VO"),
  story("22", "Rail fares review published", "Owen", "READER + GFX"),
  story(
    "23",
    "Record applications to the national apprenticeship scheme",
    "Grace",
    "READER",
  ),
  story("24", "New coastal path waymarks unveiled", "Grace", "VO"),
  story("25", "Census: Lannick fourth-fastest-growing city", "Grace", "PKG"),
  story("26", "Gale warnings along the north coast", "Owen", "READER"),
  { kind: "header", title: "PART FOUR — SCIENCE AND CULTURE" },
  story(
    "27",
    "Kittiwake-1 sends its first photograph of Earth",
    "Owen / Adewale",
    "PKG",
  ),
  story("28", "Kittiwake-1: Dr. Halima Sarr in the studio", "Owen", "LIVE"),
  story("29", "Otters in the Tolle: the first pictures of cubs", "Grace", "VO"),
  story("30", "Lannick Philharmonic announces its new season", "Grace", "VO"),
  story("31", "Book festival line-up announced", "Grace", "READER"),
  {
    kind: "item",
    story: "Break 2 (commercials)",
    presenter: null,
    type: "BREAK",
    durMs: dur(5, 30),
    unnumbered: true,
  },
  { kind: "header", title: "PART FIVE — SPORT" },
  story(
    "32",
    "Lannick Athletic 2, Port Allard 0: reaction",
    "Owen / Danso",
    "PKG",
  ),
  story(
    "33",
    "Athletic injury news before the Harrowfield Town game",
    "Owen",
    "READER",
  ),
  story("34", "Tolle Valley Herons go top of the league", "Owen", "VO"),
  story("35", "University crews take to the Tolle", "Owen", "VO"),
  story("36", "Junior swimming gala: the results", "Owen", "READER"),
  {
    kind: "item",
    story: "Break 3 (commercials)",
    presenter: null,
    type: "BREAK",
    durMs: dur(5, 30),
    unnumbered: true,
  },
  { kind: "header", title: "PART SIX — WEATHER AND CLOSE" },
  {
    kind: "item",
    story: "Weather: the full forecast",
    presenter: "Carys Lloyd",
    type: "LIVE + GFX",
    durMs: dur(2, 40),
    unnumbered: false,
  },
  story("38", "Tomorrow in Lannick: the diary", "Grace", "READER + GFX"),
  story("39", "Headlines again", "Grace, Owen", "ANC"),
  story("40", "Closer: the umbrella that came home", "Grace, Owen", "ANC + VT"),
]);

export const NEWS_NEXT_WEEK_ROWS: readonly NewsRowSpec[] = Object.freeze([
  {
    kind: "item",
    story: "Open: titles and headlines",
    presenter: "Grace, Owen",
    type: "ANC/VT",
    durMs: dur(1, 10),
    unnumbered: true,
  },
  {
    kind: "item",
    story: "Library design consultation opens",
    presenter: "Grace / Lund",
    type: "ANC + PKG",
    durMs: dur(2, 40),
    unnumbered: false,
  },
  {
    kind: "item",
    story: "Tram fares review: the council responds",
    presenter: "Owen / Adewale",
    type: "ANC + PKG",
    durMs: dur(2, 20),
    unnumbered: false,
  },
  {
    kind: "item",
    story: "Tolle Bridge: overnight closures start tomorrow",
    presenter: "Owen",
    type: "READER + GFX",
    durMs: dur(0, 45),
    unnumbered: false,
  },
  {
    kind: "item",
    story: "Book festival: two days to go",
    presenter: "Grace",
    type: "VO",
    durMs: dur(0, 40),
    unnumbered: false,
  },
  {
    kind: "item",
    story: "Lannick Athletic: Dev Ansari on the next three games",
    presenter: "Owen / Danso",
    type: "PKG",
    durMs: dur(1, 50),
    unnumbered: false,
  },
  {
    kind: "item",
    story: "Weather: the full forecast",
    presenter: "Carys Lloyd",
    type: "LIVE + GFX",
    durMs: dur(2, 40),
    unnumbered: false,
  },
  {
    kind: "item",
    story: "Tomorrow in Lannick: the diary",
    presenter: "Grace",
    type: "READER + GFX",
    durMs: dur(0, 35),
    unnumbered: false,
  },
  {
    kind: "item",
    story: "Closer: to be chosen",
    presenter: "Grace, Owen",
    type: "ANC",
    durMs: dur(1, 30),
    unnumbered: false,
  },
]);

export interface NewsCorrection {
  readonly rowKey: string;
  readonly sentAt: string;
  readonly changedAt: string;
  readonly finalPhrase: string | null;
  readonly earlierPhrase: string;
}

export const NEWS_CORRECTIONS: readonly NewsCorrection[] = Object.freeze([
  {
    rowKey: "01",
    sentAt: "N−0:58",
    changedAt: "N−0:44",
    finalPhrase: "thirty-one votes to eight, with one abstention",
    earlierPhrase: "thirty-one votes to nine",
  },
  {
    rowKey: "07",
    sentAt: "N−0:55",
    changedAt: "N−0:39",
    finalPhrase: "leaves Ardle at eight tonight",
    earlierPhrase: "leaves Ardle at nine",
  },
  {
    rowKey: "20",
    sentAt: "N−0:50",
    changedAt: "N−0:30",
    finalPhrase: null,
    earlierPhrase:
      "The shelter asks anyone who can help to ring its foster line. The number is on your screen now.",
  },
]);
