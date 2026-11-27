// Uploads a seeded PNG/JPEG/WebP binary asset through PUT /api/projects/:projectId/assets/:assetId.
import { createHash } from "node:crypto";
import { SeedDriverError } from "@manent/demo";
import type { SeedWorkspaceId } from "@manent/demo";
import { indexDocId, projectHome } from "@manent/sync-protocol";
import type { Driving } from "./driving.ts";
import { isFields } from "./link.ts";
import { SEED_CALLER, SEED_HOST } from "./server.ts";

/** Ensures `project`'s index exists, hashes `bytes`, and uploads via PUT /api/projects/:projectId/assets/:assetId. */
export async function uploadSeedAsset(
  d: Driving,
  userId: string,
  project: { projectId: string; workspaceId: SeedWorkspaceId },
  bytes: Uint8Array,
): Promise<{ assetId: string; width: number; height: number }> {
  const { target } = d;
  const projectIndex = indexDocId("project", project.projectId);
  if (target.storage.directory.placeOf(projectIndex) === null) {
    await d.call(userId, {
      method: "POST",
      path: "/api/docs",
      body: {
        docId: projectIndex,
        kind: "index",
        home: projectHome(project.projectId),
        workspaceId: project.workspaceId,
      },
    });
  }
  const assetId = createHash("sha256").update(bytes).digest("hex");
  const token = target.sessions.issue(userId);
  const path = `/api/projects/${encodeURIComponent(project.projectId)}/assets/${assetId}`;
  const response = await target.server.fetch(
    new Request(`http://${SEED_HOST}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/png",
      },
      body: new Uint8Array(bytes),
    }),
    SEED_CALLER,
  );
  if (response === null)
    throw new SeedDriverError("unavailable", `${path} was upgraded`);
  const body: unknown = await response.json().catch(() => null);
  if (response.status !== 200 && response.status !== 201) {
    const code = isFields(body) ? String(body.error) : "no code";
    throw new SeedDriverError(
      "refused",
      `PUT ${path} as ${userId}: ${response.status} ${code}`,
    );
  }
  if (
    !isFields(body) ||
    typeof body.width !== "number" ||
    typeof body.height !== "number"
  )
    throw new SeedDriverError("unavailable", `${path} gave invalid meta`);
  return { assetId, width: body.width, height: body.height };
}
