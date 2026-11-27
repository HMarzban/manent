// Words for Choose who you are: studio craft pillars, persona desk summaries and miniature sheet lines.

export interface ChooseSpotlightCopy {
  readonly deskTitle: string;
  readonly revisionLabel: string;
  readonly workspaceSummary: string;
  readonly craftLine: string;
  readonly tags: readonly string[];
  readonly sheetPage: string;
  readonly sheetHeading: string;
  readonly sheetLine: string;
  readonly sheetSpeaker: string;
  readonly sheetDialogue: string;
  readonly sheetNote: string;
}

export const CHOOSE_WORDS = Object.freeze({
  deskRegion: "Desk",
  themeSwitchLabel: "Theme",
  footerLabel: "Get Manent",
  footerDesktopTitle: "Get desktop app",
  footerDesktopBody: "Mac, Windows and Linux",
  footerPwaInstalled: "Installed app",
  footerPwaFallback: "Works offline in this browser",
  footerGithubTitle: "GitHub",
  footerGithubBody: "Public source and builds",
  pillarsLabel: "What is inside",
  pillars: [
    {
      title: "Pages as they print",
      body: "All formats share one layout for screen, print and PDF.",
    },
    {
      title: "Offline first, live sync",
      body: "Every change saves on this device first and syncs across open tabs.",
    },
    {
      title: "Built for the room",
      body: "Page locks, revision colours, full history, rundowns and prompter.",
    },
  ],
  tourTip:
    "Once inside, open Tour in the side panel for ways to try Manent — or open a second tab as another person to see live cursors.",
  rundownRows: [
    { code: "01", label: "News bulletin", time: "01:30" },
    { code: "02", label: "Harbour report", time: "02:15" },
    { code: "03", label: "Studio close", time: "00:45" },
  ],
  rundownTotal: "04:30",
  rundownBadge: "On prompter",
  blankOpening: "INT. STUDIO DESK - DAY",
  fallback: {
    deskTitle: "Studio desk",
    revisionLabel: "White draft",
    workspaceSummary: "Ready to open",
    craftLine: "Pick this person to open the Library and start writing.",
    tags: ["Offline first", "Live sync"],
    sheetPage: "1.",
    sheetHeading: "INT. STUDIO DESK - DAY",
    sheetLine: "Clean paper sits ready on the desk.",
    sheetSpeaker: "WRITER",
    sheetDialogue: "Every word stays on this device first.",
    sheetNote: "",
  } satisfies ChooseSpotlightCopy,
  personas: {
    dana: {
      deskTitle: "Writers' room · The Long Night",
      revisionLabel: "White draft",
      workspaceSummary: "Writers' room · 46 projects",
      craftLine:
        "Set workspace roles, shared styles, review rounds and the full studio slate.",
      tags: ["Workspace owner", "Board and outline", "Review rounds"],
      sheetPage: "14.",
      sheetHeading: "INT. WRITERS' ROOM - DAY",
      sheetLine: "Cards line the board. Two cursors move on the same page.",
      sheetSpeaker: "DANA",
      sheetDialogue: "Keep the harbour beat — hold the turn for Act 2.",
      sheetNote: "",
    },
    sam: {
      deskTitle: "Sam's desk · Film, book and stage",
      revisionLabel: "Working draft",
      workspaceSummary: "Sam's desk · Writers' room",
      craftLine:
        "Write across film, book, podcast, stage play and Ink, with alternates and private copies.",
      tags: ["Film and book", "Alternates", "Private copy"],
      sheetPage: "1.",
      sheetHeading: "EXT. HARBOUR - DAWN",
      sheetLine:
        "Sea mist moves across the stone glass. A quiet lantern light.",
      sheetSpeaker: "SAM",
      sheetDialogue: "Leave before the first light reaches the harbour.",
      sheetNote: "Saved on this device",
    },
    priya: {
      deskTitle: "The Long Night · Blue pages",
      revisionLabel: "Blue revision",
      workspaceSummary: "Writers' room · 46 projects",
      craftLine:
        "Lock pages and scenes, issue revision drafts and export Sides PDFs.",
      tags: ["Page lock", "Revision colours", "Sides PDF"],
      sheetPage: "42A.",
      sheetHeading: "34A  INT. HARBOUR ROOM - NIGHT  34A",
      sheetLine: "Cold rain moves across the outer glass.",
      sheetSpeaker: "PRIYA",
      sheetDialogue: "Hold the page lock — blue pages go out in five minutes.",
      sheetNote: "*",
    },
    leo: {
      deskTitle: "Writers' room · Comment round",
      revisionLabel: "Can comment",
      workspaceSummary: "Writers' room · 6 projects",
      craftLine:
        "Read drafts, leave comments in review rounds and follow live read-only rundowns.",
      tags: ["Can comment", "Review rounds", "Read-only rundown"],
      sheetPage: "28.",
      sheetHeading: "INT. ROOM - EVENING",
      sheetLine: "Rain moves across the glass. Silence holds at the desk.",
      sheetSpeaker: "LEO",
      sheetDialogue: "Nobody signed the page after the last draft.",
      sheetNote: "Sharp turn — keep this beat early in Scene 6.",
    },
    ana: {
      deskTitle: "News · Evening bulletin",
      revisionLabel: "Live rundown",
      workspaceSummary: "Writers' room · News",
      craftLine:
        "Time live show and news rundowns, add pictures and control the prompter.",
      tags: ["Timed rundown", "Pictures", "Prompter"],
      sheetPage: "LIVE",
      sheetHeading: "EVENING BULLETIN",
      sheetLine: "Timed live and sent straight to the prompter.",
      sheetSpeaker: "ANA",
      sheetDialogue: "Top of the hour — rain moves across the harbour.",
      sheetNote: "04:30",
    },
    you: {
      deskTitle: "Your desk · Blank page",
      revisionLabel: "Blank workspace",
      workspaceSummary: "Your desk · Empty",
      craftLine:
        "Start a blank script or import FDX, Fountain, Word or plain text on a quiet desk.",
      tags: ["Blank workspace", "Import files", "On this device"],
      sheetPage: "1.",
      sheetHeading: "INT. STUDIO DESK - DAY",
      sheetLine: "A clean page on your own desk. Nothing leaves this device.",
      sheetSpeaker: "",
      sheetDialogue: "",
      sheetNote: "",
    },
  } as Readonly<Record<string, ChooseSpotlightCopy>>,
} as const);
