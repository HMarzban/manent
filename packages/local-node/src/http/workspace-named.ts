// Which workspace a window's new script is placed in, read from its request.

/** The document and workspace a window's POST /api/docs names, read from a copy of its body; null for none. */
export async function workspaceNamed(
  request: Request,
): Promise<{ docId: string; workspaceId: string } | null> {
  const isDocs =
    request.method === "POST" && new URL(request.url).pathname === "/api/docs";
  // a body that is not JSON names nothing: the route refuses it
  const body: unknown = isDocs
    ? await request
        .clone()
        .json()
        .catch(() => null)
    : null;
  if (typeof body !== "object" || body === null) return null;
  if (!("docId" in body && "workspaceId" in body)) return null;
  const { docId, workspaceId } = body;
  if (typeof docId !== "string" || typeof workspaceId !== "string") return null;
  return { docId, workspaceId };
}
