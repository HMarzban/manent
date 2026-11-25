// Lannick Today 18:30 recent and today's newscasts (D-3 to D).
import { newsItem, newsLead, newsRundown, newsUnnumbered } from "./spec.ts";
import type { NewsRundownSpec } from "./spec.ts";

const YARA = "Yara";
const FELIX = "Felix";
const FELIX_YARA = "Felix, Yara";
const YARA_ANSAH = "Yara / Ansah";
const FELIX_ANSAH = "Felix / Ansah";

const OPEN_1830 = newsUnnumbered(
  "Open: titles and headlines",
  FELIX_YARA,
  "ANC/VT",
  "1:00",
);
const BREAK = newsUnnumbered("Break", null, "BREAK", "3:00");
const WEATHER_1830 = newsItem(
  "Weather: the full forecast",
  YARA,
  "READER + GFX",
  "2:20",
);
const TOMORROW = newsItem("Tomorrow in Lannick", FELIX, "READER + GFX", "0:35");
const HEADLINES_1830 = newsItem("Headlines again", FELIX_YARA, "ANC", "0:40");

export const LANNICK_TODAY_EVENING_RECENT: readonly NewsRundownSpec[] =
  Object.freeze([
    newsRundown(-3, "1830", [
      OPEN_1830,
      newsLead(
        "Otter survey: forty years on",
        FELIX,
        "READER",
        "heavy/h31/stories/10",
      ),
      newsItem(
        "Otter survey: on the river with the university's team",
        FELIX_ANSAH,
        "PKG",
        "2:50",
      ),
      newsItem(
        "Otter survey: the last otters seen in the Tolle, forty years ago",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Otters: how to watch without disturbing them",
        FELIX,
        "READER + GFX",
        "0:55",
      ),
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
        "0:40",
      ),
      newsItem(
        "Linnet Street: parking suspended for the water main works",
        FELIX,
        "READER",
        "0:40",
      ),
      newsItem(
        "Tram line 3: a lost dog rides to Halse Park",
        YARA,
        "VO",
        "0:55",
      ),
      newsItem("Central Station: cycle racks doubled", FELIX, "READER", "0:35"),
      newsItem("Ardle Quay: dredging finished", FELIX, "VO", "0:55"),
      newsItem(
        "Kittiwake-1: the last burn before its final orbit",
        YARA,
        "READER + GFX",
        "0:55",
      ),
      newsItem(
        "Night market: the licence decision due tomorrow",
        YARA,
        "READER",
        "0:40",
      ),
      newsItem(
        "Otters: Dr. Nkem Ashdown, river ecologist, in the studio",
        YARA,
        "LIVE",
        "3:00",
      ),
      newsItem("Otters: what the anglers say", FELIX, "VOX", "1:20"),
      BREAK,
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
      newsItem("Junior swimming gala: the programme", FELIX, "READER", "0:30"),
      newsItem(
        "Book festival: the first three authors named",
        YARA,
        "READER",
        "0:40",
      ),
      newsItem(
        "Herons: Rob Kinsella's hundredth game",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      WEATHER_1830,
      TOMORROW,
      HEADLINES_1830,
    ]),
    newsRundown(-2, "1830", [
      OPEN_1830,
      newsLead(
        "Night market licence approved",
        FELIX,
        "READER",
        "heavy/h31/stories/12",
      ),
      newsItem(
        "Night market: the traders get their answer",
        FELIX_ANSAH,
        "PKG",
        "2:50",
      ),
      newsItem(
        "Night market: what it means for Exchange Square",
        FELIX,
        "READER + GFX",
        "0:55",
      ),
      newsItem("Kittiwake-1 reaches its final orbit", YARA, "PKG", "2:50"),
      newsItem(
        "Kittiwake-1: Dr. Halima Sarr on what the satellite will see",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem("Otters: the survey team's photographs", YARA, "VO", "0:55"),
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
        "0:40",
      ),
      newsItem(
        "Night market: Benedetta Lusk, its organiser, in the studio",
        YARA,
        "LIVE",
        "3:00",
      ),
      BREAK,
      newsItem("Athletic: the replay squad", FELIX, "PKG", "2:50"),
      newsItem("Herons move up to second", FELIX, "VO", "0:55"),
      newsItem(
        "Junior swimming gala: the last training session",
        FELIX,
        "VO",
        "0:55",
      ),
      newsItem("Book festival: a children's day added", YARA, "READER", "0:40"),
      WEATHER_1830,
      TOMORROW,
      HEADLINES_1830,
    ]),
    newsRundown(-1, "1830", [
      OPEN_1830,
      newsLead(
        "Athletic win the cup replay",
        FELIX,
        "READER",
        "heavy/h31/stories/14",
      ),
      newsItem("Cup replay: Athletic 2, Port Allard 0", FELIX, "PKG", "2:50"),
      newsItem(
        "Cup replay: Dev Ansari after the match",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem("Cup replay: fans on the way home", FELIX, "VOX", "1:20"),
      newsItem(
        "Tolle Bridge: the overnight closures explained",
        YARA,
        "PKG",
        "2:50",
      ),
      newsItem("Tolle Bridge: the diversions", YARA, "READER + GFX", "0:55"),
      newsItem(
        "Gale warning: live from Ardle Quay",
        YARA_ANSAH,
        "LIVE",
        "3:00",
      ),
      newsItem(
        "Library vote: councillors meet tomorrow",
        YARA,
        "READER",
        "0:40",
      ),
      newsItem(
        "Night market: stalls booked for the first night",
        YARA,
        "READER",
        "0:40",
      ),
      newsItem(
        "Tram operator: forty driver places filled",
        FELIX,
        "READER",
        "0:40",
      ),
      newsItem(
        "Dye works site: the planning decision due tomorrow",
        FELIX,
        "READER",
        "0:40",
      ),
      newsItem(
        "Tolle Bridge: the council's head of highways in the studio",
        YARA,
        "LIVE",
        "3:00",
      ),
      BREAK,
      newsItem("Kittiwake-1: the camera switched on", YARA, "VO", "0:55"),
      newsItem("Herons win at Harrowfield", FELIX, "VO", "0:55"),
      newsItem("Junior swimming gala: the heats", FELIX, "VO", "0:55"),
      newsItem(
        "Book festival: the full line-up tomorrow",
        YARA,
        "READER",
        "0:40",
      ),
      newsItem(
        "Weather: the full forecast, and the gale",
        YARA,
        "READER + GFX",
        "2:00",
      ),
      TOMORROW,
      HEADLINES_1830,
    ]),
    newsRundown(0, "1830", [
      OPEN_1830,
      newsLead(
        "Tolle Exchange to become library",
        FELIX,
        "READER",
        "heavy/h31/stories/16",
      ),
      newsItem(
        "Library vote: how the council voted",
        FELIX_ANSAH,
        "PKG",
        "2:50",
      ),
      newsItem(
        "Library vote: Gita Ramsden on the next three years",
        FELIX,
        "VO + SOT",
        "1:35",
      ),
      newsItem(
        "Library vote: voices from Exchange Square",
        FELIX,
        "VOX",
        "1:20",
      ),
      newsItem(
        "Gale warning: the last Wrenna ferry leaves at eight",
        YARA,
        "READER + GFX",
        "0:55",
      ),
      newsItem("Gale: Ardle Quay gets ready", YARA, "VO", "0:55"),
      newsItem(
        "Kittiwake-1 sends its first photograph of Earth",
        YARA,
        "VO + SOT",
        "1:35",
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
        "READER + GFX",
        "0:55",
      ),
      newsItem(
        "Halse Road roadworks extended by two weeks",
        FELIX,
        "READER",
        "0:35",
      ),
      newsItem("Forty new tram drivers start training", FELIX, "VO", "0:55"),
      newsItem(
        "Library vote: Cllr Margaret Pell in the studio",
        YARA,
        "LIVE",
        "3:00",
      ),
      BREAK,
      newsItem(
        "The umbrella that came home after thirty-one years",
        YARA,
        "VO + SOT",
        "1:35",
      ),
      newsItem("Herons go top of the league", FELIX, "VO", "0:55"),
      newsItem("Athletic: Harrowfield Town next", FELIX, "READER", "0:35"),
      newsItem("Junior swimming gala: the results", FELIX, "READER", "0:30"),
      newsItem(
        "Night market opens tomorrow on Exchange Square",
        YARA,
        "VO",
        "0:55",
      ),
      newsItem(
        "Lannick Philharmonic announces its new season",
        YARA,
        "VO",
        "0:55",
      ),
      newsItem(
        "Weather: the gale tonight, and the full forecast",
        YARA,
        "READER + GFX",
        "1:50",
      ),
      TOMORROW,
      HEADLINES_1830,
    ]),
  ]);
