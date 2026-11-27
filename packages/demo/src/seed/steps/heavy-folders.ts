// Lanternfield Studios' nested folders, Dana's favourites and seeded Trash.
import { jsonMap } from "@manent/crdt";
import { indexDocId, seedDocId } from "@manent/sync-protocol";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedStep } from "../seed.ts";

interface HeavyFolderSpec {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly projects: readonly string[];
}

const DEV_ID = seedDocId("folder:heavy/2");
const TV_ID = seedDocId("folder:heavy/4");
const AUDIO_BOOKS_GAMES_ID = seedDocId("folder:heavy/6");

const HEAVY_FOLDER_SPECS: readonly HeavyFolderSpec[] = [
  {
    id: seedDocId("folder:heavy/1"),
    name: "Film — Production",
    parentId: null,
    projects: ["heavy/h01", "heavy/h05", "heavy/h08", "heavy/h13"],
  },
  {
    id: DEV_ID,
    name: "Film — Development",
    parentId: null,
    projects: ["heavy/h37", "heavy/h38", "heavy/h39", "heavy/h40"],
  },
  {
    id: seedDocId("folder:heavy/2/franchise"),
    name: "Franchise Slates",
    parentId: DEV_ID,
    projects: ["heavy/h02", "heavy/h03", "heavy/h04", "heavy/h06", "heavy/h07"],
  },
  {
    id: seedDocId("folder:heavy/2/originals"),
    name: "Original Features",
    parentId: DEV_ID,
    projects: [
      "heavy/h09",
      "heavy/h10",
      "heavy/h11",
      "heavy/h12",
      "heavy/h14",
      "heavy/h15",
      "heavy/h16",
      "heavy/h17",
      "heavy/h20",
      "heavy/h22",
      "heavy/h23",
    ],
  },
  {
    id: seedDocId("folder:heavy/3"),
    name: "Film — Archive",
    parentId: null,
    projects: ["heavy/h18", "heavy/h19", "heavy/h21"],
  },
  {
    id: TV_ID,
    name: "Television",
    parentId: null,
    projects: [],
  },
  {
    id: seedDocId("folder:heavy/4/returning"),
    name: "Returning Series",
    parentId: TV_ID,
    projects: ["heavy/h24", "heavy/h25", "heavy/h26"],
  },
  {
    id: seedDocId("folder:heavy/4/pilots"),
    name: "Pilots",
    parentId: TV_ID,
    projects: ["heavy/h27", "heavy/h28", "heavy/h29"],
  },
  {
    id: seedDocId("folder:heavy/5"),
    name: "Live",
    parentId: null,
    projects: ["heavy/h30", "heavy/h31"],
  },
  {
    id: AUDIO_BOOKS_GAMES_ID,
    name: "Audio, Books & Games",
    parentId: null,
    projects: [],
  },
  {
    id: seedDocId("folder:heavy/6/audio"),
    name: "Audio",
    parentId: AUDIO_BOOKS_GAMES_ID,
    projects: ["heavy/h32"],
  },
  {
    id: seedDocId("folder:heavy/6/publishing"),
    name: "Publishing",
    parentId: AUDIO_BOOKS_GAMES_ID,
    projects: ["heavy/h33", "heavy/h34"],
  },
  {
    id: seedDocId("folder:heavy/6/interactive"),
    name: "Interactive",
    parentId: AUDIO_BOOKS_GAMES_ID,
    projects: ["heavy/h35", "heavy/h36"],
  },
];

const DANA_FAVOURITES: readonly {
  readonly kind: "project" | "document";
  readonly key: string;
  readonly at: string;
}[] = [
  { kind: "project", key: "heavy/h01", at: "D−14 10:00" },
  { kind: "project", key: "heavy/h24", at: "D−7 10:00" },
  { kind: "document", key: "heavy/h24/401", at: "D−3 11:20" },
];

const MINUTE_MS = 60_000;
const FOLDERS_AT = "D−120 09:00";
const TRASHED_DOC_KEY = "heavy/h40/script";
// 1 day + 1 hour before nowAt so remaining time at seedAt is strictly under 29 full days ("29 days left").
const TRASHED_AT = "D−1 17:00";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const HEAVY_FOLDERS: SeedStep = {
  id: "heavy-folders",
  workspace: "heavy",
  background: true,
  async run(context) {
    const { driver, time } = context;
    if (driver === null) return [];

    const foldersBaseAt = time.at(FOLDERS_AT);
    await driver.setTime(foldersBaseAt + HEAVY_FOLDER_SPECS.length * MINUTE_MS);
    const workspaceSession = await driver.open(
      "dana",
      indexDocId("workspace", "heavy"),
    );
    try {
      await workspaceSession.change((doc) => {
        const folders = jsonMap(doc, "folders");
        const projects = jsonMap(doc, "projects");
        for (const [index, folder] of HEAVY_FOLDER_SPECS.entries()) {
          folders.set(folder.id, {
            name: folder.name,
            parentId: folder.parentId,
            createdAt: foldersBaseAt + index * MINUTE_MS,
            createdByUserId: "dana",
          });
          for (const projectKey of folder.projects) {
            const { projectId } = seedProject(projectKey);
            const existing = projects.get(projectId);
            if (isRecord(existing))
              projects.set(projectId, { ...existing, folderId: folder.id });
          }
        }
      });
    } finally {
      await workspaceSession.close();
    }

    await driver.setTime(time.at(DANA_FAVOURITES.at(-1)!.at));
    const privateSession = await driver.open(
      "dana",
      indexDocId("user", "dana"),
    );
    try {
      await privateSession.change((doc) => {
        const favourites = jsonMap(doc, "favourites");
        for (const fav of DANA_FAVOURITES) {
          const id =
            fav.kind === "project"
              ? seedProject(fav.key).projectId
              : seedDoc(fav.key).docId;
          favourites.set(id, {
            kind: fav.kind,
            workspaceId: "heavy",
            favouritedAt: time.at(fav.at),
          });
        }
      });
    } finally {
      await privateSession.close();
    }

    await driver.trash(
      "dana",
      seedDoc(TRASHED_DOC_KEY).docId,
      time.at(TRASHED_AT),
    );
    return [];
  },
};
