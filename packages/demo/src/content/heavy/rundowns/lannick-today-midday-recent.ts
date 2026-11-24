// Lannick Today 13:00 recent and today's aired newscasts (D-3 to D).
import { newsItem, newsLead, newsRundown, newsUnnumbered } from "./spec.ts";
import type { NewsRundownSpec } from "./spec.ts";

const YARA = "Yara";
const FELIX = "Felix";
const YARA_FELIX = "Yara, Felix";
const YARA_ANSAH = "Yara / Ansah";

const OPEN_1300 = newsUnnumbered(
  "Open: headlines",
  YARA_FELIX,
  "ANC/VT",
  "0:40",
);
const HEADLINES_1300 = newsItem("Headlines again", YARA_FELIX, "ANC", "0:30");

export const LANNICK_TODAY_MIDDAY_RECENT: readonly NewsRundownSpec[] =
  Object.freeze([
    newsRundown(-3, "1300", [
      OPEN_1300,
      newsLead(
        "Otters breeding in the Tolle",
        YARA,
        "READER",
        "heavy/h31/stories/09",
      ),
      newsItem(
        "Otters in the Tolle: the river survey's findings",
        YARA,
        "PKG",
        "2:50",
      ),
      newsItem("Otters: where they were found", YARA, "READER + GFX", "0:40"),
      newsItem(
        "Library report: the first public meeting",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Car park charges: the patients' group meets the hospital",
        YARA,
        "READER",
        "0:35",
      ),
      newsItem(
        "Linnet Street: parking suspended for the water main works",
        FELIX,
        "READER",
        "0:30",
      ),
      newsItem(
        "Tram line 3: a lost dog rides to Halse Park",
        FELIX,
        "VO",
        "0:55",
      ),
      newsItem("Central Station: cycle racks doubled", FELIX, "READER", "0:25"),
      newsItem("Ardle Quay: dredging finished", FELIX, "VO", "0:55"),
      newsItem(
        "Kittiwake-1: the last burn before its final orbit",
        YARA,
        "READER + GFX",
        "0:45",
      ),
      newsItem(
        "Athletic: two doubts for the replay",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Herons: a home win in front of a record crowd",
        FELIX,
        "VO",
        "0:55",
      ),
      newsItem(
        "Weather: the afternoon and evening",
        FELIX,
        "READER + GFX",
        "1:20",
      ),
      HEADLINES_1300,
    ]),
    newsRundown(-2, "1300", [
      OPEN_1300,
      newsLead(
        "Kittiwake-1 reaches final orbit",
        YARA,
        "READER",
        "heavy/h31/stories/11",
      ),
      newsItem(
        "Kittiwake-1: in the control room with the student team",
        YARA_ANSAH,
        "PKG",
        "2:50",
      ),
      newsItem("Kittiwake-1: what happens next", YARA, "READER + GFX", "0:55"),
      newsItem(
        "Night market: councillors decide this afternoon",
        YARA,
        "READER",
        "0:40",
      ),
      newsItem("Otters: the survey team's photographs", FELIX, "VO", "0:55"),
      newsItem(
        "Library report: the last public meeting",
        YARA,
        "READER",
        "0:40",
      ),
      newsItem(
        "Car park charges: the hospital's review begins",
        FELIX,
        "READER",
        "0:40",
      ),
      newsItem(
        "Gull Point museum: the first tickets sold",
        FELIX,
        "VO",
        "0:55",
      ),
      newsItem("Mercer Street: the library's book sale", YARA, "VO", "0:55"),
      newsItem(
        "Wrenna ferry: the relief boat in service",
        FELIX,
        "READER",
        "0:35",
      ),
      newsItem("Athletic: the replay squad", FELIX, "VO + SOT", "1:35"),
      newsItem("Herons move up to second", FELIX, "VO", "0:55"),
      newsItem(
        "Weather: the afternoon and evening",
        FELIX,
        "READER + GFX",
        "1:20",
      ),
      HEADLINES_1300,
    ]),
    newsRundown(-1, "1300", [
      OPEN_1300,
      newsLead(
        "Bridge resurfacing dates announced",
        YARA,
        "READER",
        "heavy/h31/stories/13",
      ),
      newsItem(
        "Tolle Bridge: the overnight closures explained",
        YARA,
        "PKG",
        "2:50",
      ),
      newsItem("Tolle Bridge: the diversions", YARA, "READER + GFX", "0:45"),
      newsItem(
        "Gale warning: the harbourmaster's advice",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Library vote: councillors meet tomorrow",
        YARA,
        "READER",
        "0:35",
      ),
      newsItem(
        "Night market: stalls booked for the first night",
        YARA,
        "READER",
        "0:30",
      ),
      newsItem("Kittiwake-1: the camera switched on", YARA, "VO", "0:45"),
      newsItem(
        "Tram operator: forty driver places filled",
        FELIX,
        "READER",
        "0:30",
      ),
      newsItem(
        "Dye works site: the planning decision due tomorrow",
        FELIX,
        "READER",
        "0:35",
      ),
      newsItem(
        "Census: the city's figures out tomorrow",
        YARA,
        "READER",
        "0:25",
      ),
      newsItem(
        "Lannick Philharmonic: its new principal horn",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Cup replay: Athletic v Port Allard this afternoon",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem("Weather: the gale on its way", FELIX, "READER + GFX", "1:10"),
      HEADLINES_1300,
    ]),
    newsRundown(0, "1300", [
      OPEN_1300,
      newsLead(
        "Library vote expected this afternoon",
        YARA,
        "READER",
        "heavy/h31/stories/15",
      ),
      newsItem(
        "Library vote: live from City Hall as the debate begins",
        YARA_ANSAH,
        "LIVE",
        "3:00",
      ),
      newsItem(
        "Library vote: what councillors are being asked",
        YARA,
        "READER + GFX",
        "0:55",
      ),
      newsItem(
        "Gale warning for the coast tonight",
        FELIX,
        "READER + GFX",
        "0:55",
      ),
      newsItem(
        "Wrenna ferries: the operator reviews tonight's sailings",
        FELIX,
        "READER",
        "0:40",
      ),
      newsItem(
        "The umbrella that came home after thirty-one years",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Kittiwake-1 sends its first photograph of Earth",
        YARA,
        "VO",
        "0:55",
      ),
      newsItem(
        "Otters in the Tolle: the first pictures of cubs",
        YARA,
        "VO",
        "0:55",
      ),
      newsItem(
        "Census: Lannick fourth-fastest-growing city",
        FELIX,
        "READER + GFX",
        "0:55",
      ),
      newsItem(
        "140 homes approved on the old dye works site",
        FELIX,
        "READER",
        "0:40",
      ),
      newsItem(
        "Halse Road roadworks extended by two weeks",
        FELIX,
        "READER",
        "0:40",
      ),
      newsItem("Herons go top of the league", FELIX, "VO", "0:55"),
      newsItem("Weather: the gale this evening", FELIX, "READER + GFX", "1:00"),
      HEADLINES_1300,
    ]),
  ]);
