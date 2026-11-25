// Good Evening, Lannick today and next week's rundowns (D to D+4).
import { showHeader, showItem, showLead, showRundown } from "./spec.ts";
import type { ShowRundownSpec } from "./spec.ts";

const NOOR = "Noor Haddad";
const ZAINAB = "Zainab Kamara";
const CIARAN = "Ciaran Moloney";
const ELODIE = "Elodie Garnier";

export const GOOD_EVENING_CURRENT: readonly ShowRundownSpec[] = Object.freeze([
  showRundown(0, [
    showHeader("PART ONE"),
    showItem("Titles and welcome", NOOR, "0:35"),
    showItem(
      "Topical opening: the vote, the wind and the otter cubs",
      ZAINAB,
      "2:30",
    ),
    showLead(
      '"What should the new library have?" phone-in; the gale; the umbrella',
      ZAINAB,
      "heavy/h30/segments/10",
    ),
    showItem(
      "Phone-in, first calls: what should the new library have?",
      null,
      "4:50",
    ),
    showItem(
      "The gale: live from Ardle Quay before the last ferry",
      null,
      "1:40",
    ),
    showItem("Coming up", NOOR, "0:20"),
    showHeader("PART TWO"),
    showItem("Studio guest: Gita Ramsden, City Librarian", null, "5:00"),
    showItem(
      "The umbrella: Walter Fenn collects it after thirty-one years (tape)",
      null,
      "2:30",
    ),
    showItem(
      "Phone-in, more calls: what should the new library have?",
      null,
      "5:00",
    ),
    showItem("Tomorrow: live from the night market", ELODIE, "0:30"),
    showItem("Closing song: The Gull Point Lanterns", null, "3:10"),
    showItem("Goodnight from Bertie", ZAINAB, "0:25"),
  ]),
  showRundown(1, [
    showItem("Titles and welcome", NOOR, "0:35"),
    showItem("Topical opening: the day in Lannick", ZAINAB, "2:15"),
    showLead(
      "Live from the night market on Exchange Square",
      CIARAN,
      "heavy/h30/segments/11",
    ),
    showItem("The night market: the first stalls open", null, "5:00"),
    showItem(
      "Guest at the market: Benedetta Lusk, the night market's organiser",
      null,
      "5:00",
    ),
    showItem("Bertie's supper from six stalls (tape)", null, "3:30"),
    showItem("Phone-in: what should the night market sell?", null, "5:00"),
    showItem("Tomorrow: live from Gull Point", ELODIE, "0:30"),
    showItem("Closing song: The Halse Bridge Ramblers", null, "3:10"),
    showItem("Goodnight from Bertie", ZAINAB, "0:25"),
  ]),
  showRundown(2, [
    showItem("Titles and welcome", NOOR, "0:35"),
    showLead(
      "The lighthouse museum reopens, live from Gull Point",
      ELODIE,
      "heavy/h30/segments/12",
    ),
    showItem("Live from the lamp room", null, "5:00"),
    showItem(
      "Guest at Gull Point: Ottoline Marr, the museum's curator",
      null,
      "5:00",
    ),
    showItem(
      "The first visitors try the museum's logbook story (tape)",
      null,
      "3:00",
    ),
    showItem("Phone-in: have you ever been inside a lighthouse?", null, "5:00"),
    showItem("Closing song: Wenna Pascoe", null, "3:10"),
    showItem("Goodnight from Bertie", ZAINAB, "0:25"),
  ]),
  showRundown(3, [
    showItem("Titles and welcome", NOOR, "0:35"),
    showLead(
      "The Kittiwake-1 picture of your street",
      CIARAN,
      "heavy/h30/segments/13",
    ),
    showItem("Your streets from space: viewers' photographs", null, "4:00"),
    showItem("Phone-in: find your street", null, "5:00"),
    showItem("Goodnight from Bertie", ZAINAB, "0:25"),
  ]),
  showRundown(4, [
    showLead(
      "Athletic preview with the manager",
      ELODIE,
      "heavy/h30/segments/14",
    ),
    showItem(
      "Studio guest: Dev Ansari, Lannick Athletic manager",
      null,
      "6:00",
    ),
    showItem(
      "Phone-in: your Athletic team to face Harrowfield Town",
      null,
      "5:00",
    ),
  ]),
]);
