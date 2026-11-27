// Writers' room nested folders, role-authentic Favourites across all five people, and seeded Private drafts.
import { jsonMap, scriptBody } from "@manent/crdt";
import { indexDocId, projectHome, seedDocId } from "@manent/sync-protocol";
import { parseSeedText } from "../../content/markup.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedWorkspaceId } from "../catalogue.ts";
import type { SeedDriverError } from "../driver.ts";
import type { SeedContext, SeedEntry, SeedStep } from "../seed.ts";
import { toBlockJSON } from "../story.ts";
import { PRIVATE_DRAFTS } from "./private-drafts-data.ts";
import type { PrivateDraftSpec } from "./private-drafts-data.ts";

interface MediumFolderSpec {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly projects: readonly string[];
}

interface FavouriteSpec {
  readonly userId: string;
  readonly workspaceId: SeedWorkspaceId;
  readonly kind: "project" | "document";
  readonly key: string;
  readonly at: string;
}

const SCRIPTED_ID = seedDocId("folder:medium/scripted");
const BROADCAST_ID = seedDocId("folder:medium/broadcast");

// Leaves The Lamp Room and Game samples unfiled at top level, ready to open or drag into a folder.
const MEDIUM_FOLDERS: readonly MediumFolderSpec[] = [
  {
    id: SCRIPTED_ID,
    name: "Scripted",
    parentId: null,
    projects: [],
  },
  {
    id: seedDocId("folder:medium/scripted/features"),
    name: "Features",
    parentId: SCRIPTED_ID,
    projects: ["medium/the-long-night"],
  },
  {
    id: seedDocId("folder:medium/scripted/series"),
    name: "Series",
    parentId: SCRIPTED_ID,
    projects: ["medium/harbour-lights"],
  },
  {
    id: BROADCAST_ID,
    name: "Broadcast",
    parentId: null,
    projects: [],
  },
  {
    id: seedDocId("folder:medium/broadcast/daily"),
    name: "Daily & Live",
    parentId: BROADCAST_ID,
    projects: ["medium/lannick-one-news", "medium/the-late-desk"],
  },
];

const fav = (
  userId: string,
  workspaceId: SeedWorkspaceId,
  kind: "project" | "document",
  key: string,
  at: string,
): FavouriteSpec => ({ userId, workspaceId, kind, key, at });

// Dana's heavy favourites live in heavy-folders.ts (merged by background adoption); all other personas' favourites live here.
const PERSONA_FAVOURITES: readonly FavouriteSpec[] = [
  fav("dana", "medium", "project", "medium/harbour-lights", "D−4 09:30"),
  fav("dana", "medium", "project", "medium/the-long-night", "D−8 11:15"),
  fav("dana", "medium", "document", "medium/harbour-lights/203", "D−2 16:40"),
  fav(
    "dana",
    "medium",
    "document",
    "medium/harbour-lights/206-outline",
    "D−1 11:20",
  ),
  fav("sam", "small", "project", "small/down-the-back", "D−5 10:00"),
  fav("sam", "small", "project", "small/handed-in", "D−9 14:10"),
  fav("sam", "small", "document", "small/handed-in/ep1", "D−3 15:20"),
  fav("sam", "medium", "project", "medium/harbour-lights", "D−6 11:00"),
  fav("sam", "medium", "document", "medium/harbour-lights/205", "D−2 14:30"),
  fav(
    "sam",
    "medium",
    "document",
    "medium/the-late-desk/monologue",
    "D−1 10:15",
  ),
  fav("priya", "medium", "project", "medium/the-long-night", "D−7 09:45"),
  fav("priya", "medium", "document", "medium/harbour-lights/201", "D−5 13:10"),
  fav("priya", "medium", "document", "medium/harbour-lights/204", "D−2 17:00"),
  fav(
    "priya",
    "medium",
    "document",
    "medium/harbour-lights/205-room-log",
    "D−1 12:30",
  ),
  fav("priya", "heavy", "project", "heavy/h01", "D−12 10:00"),
  fav("priya", "heavy", "project", "heavy/h13", "D−10 10:30"),
  fav("priya", "heavy", "document", "heavy/h24/401", "D−6 15:00"),
  fav("leo", "medium", "project", "medium/the-lamp-room", "D−5 16:00"),
  fav("leo", "medium", "project", "medium/harbour-lights", "D−9 11:30"),
  fav("leo", "medium", "document", "medium/harbour-lights/203", "D−2 14:15"),
  fav(
    "leo",
    "medium",
    "document",
    "medium/harbour-lights/206-outline",
    "D−1 15:40",
  ),
  fav("ana", "medium", "project", "medium/lannick-one-news", "D−6 08:30"),
  fav("ana", "medium", "project", "medium/the-late-desk", "D−10 09:15"),
  fav(
    "ana",
    "medium",
    "document",
    "medium/lannick-one-news/stories/01",
    "D−1 08:40",
  ),
  fav(
    "ana",
    "medium",
    "document",
    "medium/lannick-one-news/stories/07",
    "D−1 08:50",
  ),
  fav(
    "ana",
    "medium",
    "document",
    "medium/the-late-desk/monologue",
    "D−2 13:20",
  ),
];

const MINUTE_MS = 60_000;
const FOLDERS_AT = "D−20 09:00";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function seedMediumFolders(context: SeedContext): Promise<void> {
  const { driver, time } = context;
  if (driver === null) return;
  const baseAt = time.at(FOLDERS_AT);
  await driver.setTime(baseAt + MEDIUM_FOLDERS.length * MINUTE_MS);
  const session = await driver.open("dana", indexDocId("workspace", "medium"));
  try {
    await session.change((doc) => {
      const folders = jsonMap(doc, "folders");
      const projects = jsonMap(doc, "projects");
      for (const [index, folder] of MEDIUM_FOLDERS.entries()) {
        folders.set(folder.id, {
          name: folder.name,
          parentId: folder.parentId,
          createdAt: baseAt + index * MINUTE_MS,
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
    await session.close();
  }
}

async function seedPrivateDraft(
  context: SeedContext,
  spec: PrivateDraftSpec,
): Promise<void> {
  const { driver, ids, time } = context;
  if (driver === null) return;
  await driver.setTime(time.at(spec.createdAt));
  await driver.create(spec.userId, {
    docId: spec.docId,
    kind: "script",
    home: projectHome(spec.projectId),
    workspaceId: null,
  });
  await driver.setTime(time.at(spec.editedAt));
  const session = await driver.open(spec.userId, spec.docId);
  try {
    if (spec.format !== "screenplay") {
      if (driver.capabilities.has("settings")) {
        const result = await session.set("script.format", spec.format);
        if (result === "refused") {
          const err: SeedDriverError | Error = new RangeError(
            `the ${spec.format} format of private:${spec.userId}/${spec.slug} was refused`,
          );
          throw err;
        }
      } else {
        context.skip(
          "settings",
          `the ${spec.format} format of private:${spec.userId}/${spec.slug}`,
        );
      }
    }
    const { blocks } = parseSeedText(spec.text);
    const json = blocks.map((block) => toBlockJSON(block, ids()));
    await session.change((doc) =>
      scriptBody(doc).write((w) => {
        if (!w.insertBlocks(null, json))
          throw new RangeError(`could not write private draft ${spec.slug}`);
      }),
    );
  } finally {
    await session.close();
  }
}

async function seedPersonaIndexes(context: SeedContext): Promise<void> {
  const { driver, time } = context;
  if (driver === null) return;
  const userIds = new Set<string>([
    ...PERSONA_FAVOURITES.map((f) => f.userId),
    ...PRIVATE_DRAFTS.map((d) => d.userId),
  ]);
  for (const userId of userIds) {
    const favs = PERSONA_FAVOURITES.filter((f) => f.userId === userId);
    const drafts = PRIVATE_DRAFTS.filter((d) => d.userId === userId);
    for (const draft of drafts) await seedPrivateDraft(context, draft);
    const latestAt = Math.max(
      ...favs.map((f) => time.at(f.at)),
      ...drafts.map((d) => time.at(d.editedAt)),
    );
    await driver.setTime(latestAt);
    const session = await driver.open(userId, indexDocId("user", userId));
    try {
      await session.change((doc) => {
        const favourites = jsonMap(doc, "favourites");
        for (const entry of favs) {
          const id =
            entry.kind === "project"
              ? seedProject(entry.key).projectId
              : seedDoc(entry.key).docId;
          favourites.set(id, {
            kind: entry.kind,
            workspaceId: entry.workspaceId,
            favouritedAt: time.at(entry.at),
          });
        }
        const privateFolder = jsonMap(doc, "private_folder");
        for (const draft of drafts) {
          const createdAt = time.at(draft.createdAt);
          const editedAt = time.at(draft.editedAt);
          privateFolder.set(draft.projectId, {
            title: draft.projectTitle,
            kind: draft.projectKind,
            createdAt,
            createdByUserId: draft.userId,
            folderId: null,
          });
          privateFolder.set(draft.docId, {
            projectId: draft.projectId,
            title: draft.docTitle,
            kind: "script",
            createdAt,
            editedAt,
            editedByUserId: draft.userId,
            airDate: null,
            rundownId: null,
            trashedAt: null,
            trashedByUserId: null,
          });
        }
      });
    } finally {
      await session.close();
    }
  }
}

const MANIFEST_ENTRIES: readonly SeedEntry[] = Object.freeze(
  PRIVATE_DRAFTS.map((draft) => ({
    project: `private:${draft.userId}/${draft.slug}`,
    documents: 1,
  })),
);

export const WORKSPACE_ORGANISATION: SeedStep = {
  id: "workspace-organisation",
  workspace: "medium",
  background: false,
  async run(context) {
    if (context.driver === null) return [...MANIFEST_ENTRIES];
    await seedMediumFolders(context);
    await seedPersonaIndexes(context);
    return [...MANIFEST_ENTRIES];
  },
};
