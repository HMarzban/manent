// Lanternfield Studios' folders, Dana's favourites and seeded Trash.
import { jsonMap } from "@manent/crdt";
import { indexDocId, seedDocId } from "@manent/sync-protocol";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedStep } from "../seed.ts";

interface HeavyFolderSpec {
  readonly id: string;
  readonly name: string;
  readonly projects: readonly string[];
}

const HEAVY_FOLDER_SPECS: readonly HeavyFolderSpec[] = [
  {
    id: seedDocId("folder:heavy/1"),
    name: "Film — Production",
    projects: ["heavy/h01", "heavy/h05", "heavy/h08", "heavy/h13"],
  },
  {
    id: seedDocId("folder:heavy/2"),
    name: "Film — Development",
    projects: [
      "heavy/h02",
      "heavy/h03",
      "heavy/h04",
      "heavy/h06",
      "heavy/h07",
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
      "heavy/h37",
      "heavy/h38",
      "heavy/h39",
      "heavy/h40",
    ],
  },
  {
    id: seedDocId("folder:heavy/3"),
    name: "Film — Archive",
    projects: ["heavy/h18", "heavy/h19", "heavy/h21"],
  },
  {
    id: seedDocId("folder:heavy/4"),
    name: "Television",
    projects: [
      "heavy/h24",
      "heavy/h25",
      "heavy/h26",
      "heavy/h27",
      "heavy/h28",
      "heavy/h29",
    ],
  },
  {
    id: seedDocId("folder:heavy/5"),
    name: "Live",
    projects: ["heavy/h30", "heavy/h31"],
  },
  {
    id: seedDocId("folder:heavy/6"),
    name: "Audio, Books & Games",
    projects: ["heavy/h32", "heavy/h33", "heavy/h34", "heavy/h35", "heavy/h36"],
  },
];

const DANA_FAVOURITES: readonly {
  readonly projectKey: string;
  readonly at: string;
}[] = [
  { projectKey: "heavy/h01", at: "D−14 10:00" },
  { projectKey: "heavy/h24", at: "D−7 10:00" },
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
            parentId: null,
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
          favourites.set(seedProject(fav.projectKey).projectId, {
            kind: "project",
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
