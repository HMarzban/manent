// The members the seed adds who are not sign-in choices: Small's second person and Lanternfield Studios' staff.
import type { Capability, DocRole } from "@manent/sync-protocol";

export interface GeneratedMember {
  userId: string;
  name: string;
  /** The job title shown beside the name. */
  title: string;
  workspaceId: "small" | "heavy";
  /** The role on the workspace's index. */
  role: DocRole;
  capabilities: readonly Capability[];
  /** The codes of the projects they work on ("H24"). */
  activeOn: readonly string[];
  /** One of the simulated writers Add writers draws from. */
  writerPool: boolean;
}

interface Access {
  role: DocRole;
  capabilities: readonly Capability[];
}

const access = (role: DocRole, ...capabilities: Capability[]): Access =>
  Object.freeze({ role, capabilities: Object.freeze(capabilities) });

const EDIT = access("edit");
const EDIT_ISSUE = access("edit", "issue_revisions");
const EDIT_RUNDOWNS = access("edit", "edit_rundowns");
const EDIT_RUNDOWNS_PROMPTER = access(
  "edit",
  "send_to_prompter",
  "edit_rundowns",
);
const COMMENT = access("comment");
const VIEW = access("view");
const VIEW_PROMPTER = access("view", "send_to_prompter");

type Row = readonly [
  name: string,
  title: string,
  access: Access,
  activeOn: string,
  writerPool?: true,
];

const code = (n: number): string => `H${String(n).padStart(2, "0")}`;

/** "H09–H17, H20" lists H09 to H17 and H20. */
function codesOf(list: string): string[] {
  return list.split(", ").flatMap((item) => {
    const [from = "", to = from] = item.split("–");
    const first = Number(from.slice(1));
    const last = Number(to.slice(1));
    return Array.from({ length: last - first + 1 }, (_, i) => code(first + i));
  });
}

/** The name in lower case, accents dropped, spaces as "-": "Clémence Aubry" is "clemence-aubry". */
const userIdOf = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(" ", "-");

// Signe Vestergaard comments on the workspace; her edit role on the long manuscript is set on that document alone.
const HEAVY_MEMBERS: readonly Row[] = [
  ["Declan Furey", "Showrunner, Ward Nine", EDIT, "H24"],
  ["Yusuf Demirel", "Writer, co-executive producer, Ward Nine", EDIT, "H24"],
  ["Saoirse Galvin", "Writer, Ward Nine", EDIT, "H24, H28"],
  ["Amara Nwosu", "Writer, Ward Nine", EDIT, "H24", true],
  ["Niamh Corrigan", "Writers' assistant, Ward Nine", EDIT, "H24", true],
  ["Mateus Ferreira", "Script coordinator, Ward Nine", EDIT_ISSUE, "H24"],
  ["Arjun Mehra", "Showrunner, Number Twelve, Larch Road", EDIT, "H25"],
  ["Fenella Pryce", "Writer, Larch Road", EDIT, "H25", true],
  ["Callum Rafferty", "Writer, Larch Road", EDIT, "H25, H27", true],
  ["Leilani Kahale", "Writers' assistant, Larch Road", EDIT, "H25", true],
  ["Jiahui Wen", "Head writer, Moss & Pebble", EDIT, "H26, H36"],
  ["Clémence Aubry", "Writer, Paper Moons and Moss & Pebble", EDIT, "H08, H26"],
  ["Gwen Treharne", "Script coordinator, animation", EDIT_ISSUE, "H26, H08"],
  ["Kenji Arakawa", "Voice director", COMMENT, "H26, H08"],
  [
    "Ines Arbeloa",
    "Author of the Ned Ashby novels; co-writer of the film",
    EDIT,
    "H01, H34",
  ],
  ["Tobias Lindqvist", "Screenwriter, Ned Ashby films", EDIT, "H01, H02", true],
  ["Rosalind Kemp", "Producer, Ned Ashby films", COMMENT, "H01, H02"],
  [
    "Wren Abernethy",
    "Writers' assistant, Ned Ashby films",
    EDIT,
    "H01, H02",
    true,
  ],
  ["Marisol Etxeberria", "Screenwriter, Ember Fleet", EDIT, "H03, H04, H35"],
  ["Lior Ben-Haim", "Screenwriter, Ember Fleet", EDIT, "H03, H04", true],
  [
    "Beatriz Salgado",
    "Writers' assistant, Ember Fleet",
    EDIT,
    "H03, H04",
    true,
  ],
  ["Gideon Achterberg", "Executive, Film", COMMENT, "H01, H03, H05"],
  ["Kwame Boakye", "Screenwriter, Keeper films", EDIT, "H05, H06, H07"],
  ["Hana Moriyama", "Screenwriter, Keeper films", EDIT, "H05, H06", true],
  ["Freya Haldane", "Producer, Keeper films", COMMENT, "H05, H06, H07"],
  ["Ruth Abendroth", "Script coordinator, Keeper films", EDIT_ISSUE, "H05"],
  [
    "Signe Vestergaard",
    "Author of The Keeper of the Last Bell",
    COMMENT,
    "H33, H05",
  ],
  ["Delphine Moreau-Kaye", "Editor, Lanternfield Books", EDIT, "H33, H34"],
  ["Ottilie Brandt", "Copy-editor, Lanternfield Books", EDIT, "H33, H34"],
  ["Oluwaseun Adebayo", "Head of Film", COMMENT, "H01–H23, H37–H40"],
  [
    "Thandiwe Mokoena",
    "Development executive, Film",
    COMMENT,
    "H09–H17, H20, H22, H23, H37–H40",
  ],
  ["Rafael Quintero-Shaw", "Writer", EDIT, "H09"],
  ["Emeka Obi", "Writer", EDIT, "H10"],
  ["Ingrid Haugland", "Writer", EDIT, "H11", true],
  ["Samir Belkacem", "Writer", EDIT, "H12"],
  ["Esperanza Toledo", "Writer", EDIT, "H13"],
  ["Hamish Gunn", "Writer", EDIT, "H14", true],
  ["Astrid Lemaire", "Writer", EDIT, "H15"],
  ["Pavel Strnad", "Writer", EDIT, "H16"],
  ["Teodora Nikolić", "Writer", EDIT, "H17", true],
  ["Marcus Oyelaran", "Writer", EDIT, "H18, H22"],
  ["Jonah Whitcombe", "Writer", EDIT, "H19, H21"],
  ["Lakshmi Raman", "Writer", EDIT, "H20", true],
  ["Bastian Krol", "Writer", EDIT, "H23"],
  ["Celeste Duprés", "Writer", EDIT, "H37"],
  ["Ezra Lindgren", "Writer", EDIT, "H38", true],
  ["Paloma Ruiz-Hart", "Writer", EDIT, "H39"],
  ["Florin Ionescu", "Writer", EDIT, "H40"],
  ["Imogen Talbot", "Writer, Small Claims pilot", EDIT, "H27"],
  ["Kofi Mensah-Doyle", "Writer, The Night Porter pilot", EDIT, "H28", true],
  ["Maeve Dunleavy", "Creator, Tidecallers", EDIT, "H29"],
  ["Tariq Al-Masri", "Story editor, television", EDIT, "H24, H29"],
  ["Solveig Aune", "Story editor, Keeper films", EDIT, "H05, H06"],
  ["Dmitri Savelyev", "Development assistant", EDIT, "H09–H17"],
  ["Ama Asiedu", "Producer, television", COMMENT, "H24, H25, H27, H28"],
  ["Hugo Marchetti", "Producer, Good Evening, Lannick", EDIT_RUNDOWNS, "H30"],
  ["Zainab Kamara", "Head writer, Good Evening, Lannick", EDIT, "H30", true],
  ["Ciaran Moloney", "Writer, Good Evening, Lannick", EDIT, "H30", true],
  ["Elodie Garnier", "Writer, Good Evening, Lannick", EDIT, "H30", true],
  ["Bertie Lane", "Presenter, Good Evening, Lannick", VIEW, "H30"],
  ["Mirela Popescu", "Prompter operator", VIEW_PROMPTER, "H30, H31"],
  ["Ivo Radić", "Prompter operator", VIEW_PROMPTER, "H31, H30"],
  [
    "Nadia Petrenko",
    "News editor, Lannick Today",
    EDIT_RUNDOWNS_PROMPTER,
    "H31",
  ],
  [
    "Joaquín Ibarra",
    "Senior producer, Lannick Today",
    EDIT_RUNDOWNS_PROMPTER,
    "H31",
  ],
  ["Yara Saleh", "Anchor, Lannick Today", EDIT, "H31"],
  ["Felix Eze", "Anchor, Lannick Today", EDIT, "H31"],
  ["Efua Ansah", "Reporter and weekend anchor", EDIT, "H31"],
  ["Greta Sorensen", "Producer, Down the Tolle", EDIT, "H32"],
  ["Anil Bhattacharya", "Host and writer, Down the Tolle", EDIT, "H32"],
  ["Juniper Cobb", "Researcher, Down the Tolle", EDIT, "H32"],
  ["Luca Ferrandi", "Narrative designer, Ember Fleet: Wayfinder", EDIT, "H35"],
  ["Benedikt Auer", "Narrative designer, Puddle Hunt", EDIT, "H36, H35"],
  ["Oskar Wieland", "Script reader (coverage)", COMMENT, "H09–H17"],
  [
    "Isaac Ferrante",
    "Script reader (coverage)",
    COMMENT,
    "H20, H22, H23, H37–H40",
  ],
  ["Rhys Trevenna", "Clearance reader", COMMENT, "H01, H03, H05, H24"],
  [
    "Mehmet Arslan",
    "Production coordinator (sides, distribution)",
    EDIT,
    "H01, H05",
  ],
  ["Ayesha Qureshi", "Executive, Television", COMMENT, "H24–H29"],
  ["Noor Haddad", "Writers' assistant, live", EDIT, "H30, H31", true],
];

/** Small's second person first, then Lanternfield Studios' staff in the order of its people list. */
export const GENERATED_MEMBERS: readonly GeneratedMember[] = Object.freeze([
  {
    userId: "nell-varga",
    name: "Nell Varga",
    title: "Sam's literary and screen manager",
    workspaceId: "small",
    role: "comment",
    capabilities: [],
    activeOn: [],
    writerPool: false,
  },
  ...HEAVY_MEMBERS.map(
    ([
      name,
      title,
      { role, capabilities },
      activeOn,
      writerPool,
    ]): GeneratedMember => ({
      userId: userIdOf(name),
      name,
      title,
      workspaceId: "heavy",
      role,
      capabilities,
      activeOn: codesOf(activeOn),
      writerPool: writerPool ?? false,
    }),
  ),
]);
