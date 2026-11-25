// Lannick Today next week's started newscasts (D+1 to D+7, 13:00 and 18:30).
import { newsItem, newsLead, newsRundown, newsUnnumbered } from "./spec.ts";
import type { NewsRundownSpec } from "./spec.ts";

const YARA = "Yara";
const FELIX = "Felix";
const YARA_FELIX = "Yara, Felix";
const FELIX_YARA = "Felix, Yara";
const YARA_ANSAH = "Yara / Ansah";
const FELIX_ANSAH = "Felix / Ansah";

const OPEN_1300 = newsUnnumbered(
  "Open: headlines",
  YARA_FELIX,
  "ANC/VT",
  "0:40",
);
const OPEN_1830 = newsUnnumbered(
  "Open: titles and headlines",
  FELIX_YARA,
  "ANC/VT",
  "1:00",
);
const BREAK = newsUnnumbered("Break", null, "BREAK", "3:00");
const WEATHER_1300 = newsItem(
  "Weather: the afternoon and evening",
  FELIX,
  "READER + GFX",
  "1:20",
);
const WEATHER_1830 = newsItem(
  "Weather: the full forecast",
  YARA,
  "READER + GFX",
  "2:20",
);

export const LANNICK_TODAY_UPCOMING: readonly NewsRundownSpec[] = Object.freeze(
  [
    newsRundown(1, "1300", [
      OPEN_1300,
      newsLead("Night market opens", YARA, "READER", "heavy/h31/stories/17"),
      newsItem(
        "Night market: live as the stalls set up",
        YARA_ANSAH,
        "LIVE",
        "2:00",
      ),
      newsItem("Library vote: what happens next", YARA, "READER", "0:40"),
      newsItem("Gale: the clear-up on the coast", FELIX, "VO", "0:40"),
      WEATHER_1300,
    ]),
    newsRundown(1, "1830", [
      OPEN_1830,
      newsLead(
        "Night market: first night",
        FELIX,
        "READER",
        "heavy/h31/stories/18",
      ),
      newsItem(
        "Night market: live from Exchange Square",
        FELIX_ANSAH,
        "LIVE",
        "2:30",
      ),
      newsItem("Library vote: what happens next", YARA, "READER", "0:40"),
      newsItem(
        "Wrenna ferries back to the full timetable",
        YARA,
        "READER",
        "0:30",
      ),
      BREAK,
      WEATHER_1830,
      newsItem("Headlines again", FELIX_YARA, "ANC", "0:40"),
    ]),
    newsRundown(2, "1300", [
      OPEN_1300,
      newsLead(
        "Lighthouse museum reopens",
        YARA,
        "READER",
        "heavy/h31/stories/19",
      ),
      newsItem("Gull Point: live at the opening", YARA_ANSAH, "LIVE", "2:30"),
      newsItem(
        "Night market: the first night's visitors",
        FELIX,
        "READER",
        "0:35",
      ),
      WEATHER_1300,
    ]),
    newsRundown(2, "1830", [
      OPEN_1830,
      newsItem(
        "Gull Point: the museum's first day",
        FELIX_ANSAH,
        "PKG",
        "2:10",
      ),
      BREAK,
      WEATHER_1830,
    ]),
    newsRundown(3, "1300", [
      OPEN_1300,
      newsLead(
        "Rail engineering works begin",
        YARA,
        "READER",
        "heavy/h31/stories/20",
      ),
      newsItem(
        "Coast line: the replacement buses",
        YARA,
        "READER + GFX",
        "0:45",
      ),
      WEATHER_1300,
    ]),
    newsRundown(3, "1830", [
      OPEN_1830,
      newsItem("Coast line: the first day of the works", FELIX, "VO", "0:45"),
      WEATHER_1830,
    ]),
    newsRundown(4, "1300", [
      OPEN_1300,
      newsLead("Athletic: team news", YARA, "READER", "heavy/h31/stories/21"),
      newsItem(
        "Athletic: Dev Ansari before Harrowfield Town",
        FELIX,
        "VO + SOT",
        "1:10",
      ),
      WEATHER_1300,
    ]),
    newsRundown(4, "1830", [
      OPEN_1830,
      newsItem("Athletic v Harrowfield Town: tickets", FELIX, "READER", "0:30"),
      WEATHER_1830,
    ]),
    newsRundown(5, "1300", [
      OPEN_1300,
      newsLead(
        "Athletic v Harrowfield Town preview",
        YARA,
        "READER",
        "heavy/h31/stories/22",
      ),
      newsItem(
        "Athletic v Harrowfield Town: getting to the ground",
        FELIX,
        "READER + GFX",
        "0:40",
      ),
      WEATHER_1300,
    ]),
    newsRundown(5, "1830", [
      OPEN_1830,
      newsItem("Athletic v Harrowfield Town: report", FELIX, "PKG", "2:00"),
      BREAK,
      WEATHER_1830,
    ]),
    newsRundown(6, "1300", [
      OPEN_1300,
      newsItem("Library consultation: opens tomorrow", YARA, "READER", "0:35"),
      WEATHER_1300,
    ]),
    newsRundown(6, "1830", [
      OPEN_1830,
      newsItem(
        "Tolle Bridge: closures from the day after tomorrow",
        FELIX,
        "READER + GFX",
        "0:45",
      ),
      newsItem(
        "Tram fares review: the council responds tomorrow",
        FELIX,
        "READER",
        "0:30",
      ),
      WEATHER_1830,
    ]),
    newsRundown(7, "1300", [
      OPEN_1300,
      newsLead(
        "Library consultation opens",
        YARA,
        "READER",
        "heavy/h31/stories/23",
      ),
      newsItem(
        "Library consultation: how to take part",
        YARA,
        "READER + GFX",
        "0:45",
      ),
      newsItem(
        "Tram fares review: the council responds this afternoon",
        FELIX,
        "READER",
        "0:30",
      ),
      newsItem(
        "Tolle Bridge: closures start tomorrow night",
        FELIX,
        "READER + GFX",
        "0:40",
      ),
      WEATHER_1300,
    ]),
    newsRundown(7, "1830", [
      OPEN_1830,
      newsLead("Tram fares review", FELIX, "READER", "heavy/h31/stories/24"),
      newsItem(
        "Tram fares review: the council's response",
        FELIX,
        "PKG",
        "2:00",
      ),
      newsItem("Library consultation opens", YARA, "VO + SOT", "1:05"),
      newsItem(
        "Tolle Bridge: closures start tomorrow night",
        YARA,
        "READER + GFX",
        "0:45",
      ),
      newsItem("Book festival: two days to go", YARA, "VO", "0:40"),
      BREAK,
      WEATHER_1830,
    ]),
  ],
);
