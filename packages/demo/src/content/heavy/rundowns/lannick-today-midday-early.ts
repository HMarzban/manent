// Lannick Today 13:00 aired newscasts (D-7 to D-4).
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

export const LANNICK_TODAY_MIDDAY_EARLY: readonly NewsRundownSpec[] =
  Object.freeze([
    newsRundown(-7, "1300", [
      OPEN_1300,
      newsLead(
        "Tram line 3: first passengers",
        YARA,
        "READER",
        "heavy/h31/stories/01",
      ),
      newsItem(
        "Tram line 3: live from the Halse Park terminus",
        YARA_ANSAH,
        "LIVE",
        "3:00",
      ),
      newsItem(
        "Tram line 3: what the first passengers say",
        YARA,
        "VOX",
        "1:05",
      ),
      newsItem("Tram line 3: the new timetable", YARA, "READER + GFX", "0:40"),
      newsItem(
        "Halse Road: lane closures for the drainage works",
        FELIX,
        "READER + GFX",
        "0:40",
      ),
      newsItem(
        "Central Station: the ticket hall lifts back in service",
        FELIX,
        "READER",
        "0:25",
      ),
      newsItem(
        "Recycling collection days change in three wards",
        FELIX,
        "READER + GFX",
        "0:40",
      ),
      newsItem(
        "Lannick General opens its new outpatients' entrance",
        YARA,
        "VO + SOT",
        "1:25",
      ),
      newsItem("Ardle Quay: harbour dredging begins", FELIX, "VO", "0:40"),
      newsItem(
        "Weir Road cycle lane: consultation opens",
        YARA,
        "READER + GFX",
        "0:45",
      ),
      newsItem(
        "Cup: Athletic travel to Port Allard",
        FELIX,
        "VO + SOT",
        "1:30",
      ),
      newsItem("Herons beat the Port Allard Pilots", FELIX, "VO", "0:45"),
      newsItem(
        "Weather: the afternoon and evening",
        FELIX,
        "READER + GFX",
        "1:20",
      ),
      HEADLINES_1300,
    ]),
    newsRundown(-6, "1300", [
      OPEN_1300,
      newsLead(
        "Library report published",
        YARA,
        "READER",
        "heavy/h31/stories/03",
      ),
      newsItem(
        "Library report: the Tolle Exchange recommended",
        YARA,
        "PKG",
        "2:50",
      ),
      newsItem(
        "Library report: what the conversion would cost",
        YARA,
        "READER + GFX",
        "0:45",
      ),
      newsItem(
        "School meals trial announced for twelve primaries",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Tram line 3: the first day's passenger count",
        FELIX,
        "READER + GFX",
        "0:40",
      ),
      newsItem(
        "Halse Road drainage works: the diversions",
        FELIX,
        "READER + GFX",
        "0:40",
      ),
      newsItem(
        "Ardle Quay: the fish auction's new screens",
        FELIX,
        "VO",
        "0:45",
      ),
      newsItem("Blood donor sessions at City Hall", YARA, "READER", "0:30"),
      newsItem(
        "University of Lannick opens its new river laboratory",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Cup: Athletic draw 1–1 at Port Allard",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Cup replay: tickets on sale at the ground",
        FELIX,
        "READER",
        "0:30",
      ),
      newsItem(
        "Weather: the afternoon and evening",
        FELIX,
        "READER + GFX",
        "1:20",
      ),
      HEADLINES_1300,
    ]),
    newsRundown(-5, "1300", [
      OPEN_1300,
      newsLead(
        "Lighthouse restoration finished",
        YARA,
        "READER",
        "heavy/h31/stories/05",
      ),
      newsItem(
        "Gull Point: the restorers' last day",
        YARA_ANSAH,
        "PKG",
        "2:50",
      ),
      newsItem(
        "Gull Point: the museum's opening date",
        YARA,
        "READER + GFX",
        "0:35",
      ),
      newsItem(
        "Library report: public meetings at three branches",
        YARA,
        "READER",
        "0:35",
      ),
      newsItem(
        "School meals trial: the twelve schools named",
        FELIX,
        "READER + GFX",
        "0:45",
      ),
      newsItem(
        "Tram line 3: a second stop at Halse Park opens",
        FELIX,
        "VO",
        "0:55",
      ),
      newsItem(
        "Linnet Street: residents told of water main works",
        FELIX,
        "READER",
        "0:30",
      ),
      newsItem("Central Station: new departure boards", FELIX, "VO", "0:55"),
      newsItem(
        "Lannick Philharmonic: a free concert in the City Hall foyer",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Halse Park allotments: the waiting list reopens",
        YARA,
        "READER",
        "0:30",
      ),
      newsItem("Athletic: Dev Ansari on the replay", FELIX, "VO + SOT", "1:35"),
      newsItem("Herons beat the Harrowfield Kestrels", FELIX, "VO", "0:55"),
      newsItem(
        "Weather: the afternoon and evening",
        FELIX,
        "READER + GFX",
        "1:20",
      ),
      HEADLINES_1300,
    ]),
    newsRundown(-4, "1300", [
      OPEN_1300,
      newsLead(
        "Hospital car park charges: patients' group",
        YARA,
        "READER",
        "heavy/h31/stories/07",
      ),
      newsItem(
        "Lannick General car park: what patients pay",
        YARA_ANSAH,
        "PKG",
        "2:50",
      ),
      newsItem(
        "Car park charges: the hospital responds",
        YARA,
        "READER",
        "0:35",
      ),
      newsItem(
        "Car park charges: how they compare",
        YARA,
        "READER + GFX",
        "0:50",
      ),
      newsItem(
        "Library report: a third public meeting added",
        YARA,
        "READER",
        "0:30",
      ),
      newsItem(
        "Tram line 3: late-evening services added",
        FELIX,
        "READER",
        "0:30",
      ),
      newsItem(
        "Halse Road: the drainage works reach the junction",
        FELIX,
        "VO",
        "0:55",
      ),
      newsItem(
        "Weir Road cycle lane: the consultation's first week",
        YARA,
        "READER + GFX",
        "0:45",
      ),
      newsItem(
        "Ardle Quay: the ferry operator's new booking line",
        FELIX,
        "READER",
        "0:30",
      ),
      newsItem("Wrenna Island: the pier lights replaced", FELIX, "VO", "0:55"),
      newsItem(
        "Gull Point museum: volunteers wanted",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem("Athletic: replay tickets sell out", FELIX, "VO + SOT", "1:35"),
      newsItem(
        "Weather: the afternoon and evening",
        FELIX,
        "READER + GFX",
        "1:20",
      ),
      HEADLINES_1300,
    ]),
  ]);
