// Local-node HTTP routes for starting, inspecting, and stopping prompter file writing.
import { isAbsolute } from "node:path";
import type {
  ErrorResponse,
  HttpErrorCode,
  PrompterFilesStatus,
} from "@manent/sync-protocol";
import { isDocId } from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import type { LocalRoute, LocalRouteContext } from "../http/local-routes.ts";
import type { PrompterEncoding } from "./encoding.ts";
import { createPrompterFilesWriter, feedFromPrompterHandle } from "./writer.ts";

const MAX_FOLDER_LENGTH = 4096;

interface StartRequest {
  readonly rundownId: string;
  readonly folder: string;
  readonly encoding: PrompterEncoding;
}

interface ActiveRun {
  readonly rundownId: string;
  status: PrompterFilesStatus;
  stop(emitNull: boolean): void;
}

const failure = (code: HttpErrorCode, status: number): Response =>
  Response.json({ error: code } satisfies ErrorResponse, { status });

const noContent = (): Response => new Response(null, { status: 204 });

function readStartRequest(body: unknown): StartRequest | null {
  if (typeof body !== "object" || body === null) return null;
  if (!("rundownId" in body && "folder" in body && "encoding" in body))
    return null;
  const { rundownId, folder, encoding } = body;
  if (!isDocId(rundownId)) return null;
  if (
    typeof folder !== "string" ||
    folder.trim() === "" ||
    folder.length > MAX_FOLDER_LENGTH ||
    folder.includes("\0") ||
    !isAbsolute(folder)
  )
    return null;
  if (encoding !== "utf-8" && encoding !== "windows-1252") return null;
  return { rundownId, folder, encoding };
}

/** Registers GET/POST/DELETE `/api/local/prompter-files` on the desktop local node. */
export function prompterFilesRoutes(
  context: LocalRouteContext,
): Record<string, LocalRoute> {
  const activeByUser = new Map<string, ActiveRun>();

  const sendStatus = (status: PrompterFilesStatus | null): void => {
    context.shell.shell.send({ v: 1, t: "prompter_files", status });
  };

  const stopFor = (userId: string, emitNull: boolean): void => {
    const current = activeByUser.get(userId);
    if (current === undefined) {
      if (emitNull && activeByUser.size === 0) sendStatus(null);
      return;
    }
    activeByUser.delete(userId);
    current.stop(emitNull);
  };

  const stopAll = (emitNull: boolean): void => {
    for (const userId of Array.from(activeByUser.keys()))
      stopFor(userId, emitNull);
  };

  context.onClose(() => stopAll(false));

  return {
    "GET /api/local/prompter-files"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      return Response.json(activeByUser.get(person.userId)?.status ?? null);
    },

    "DELETE /api/local/prompter-files"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      stopFor(person.userId, true);
      return noContent();
    },

    async "POST /api/local/prompter-files"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      const parsed = readStartRequest(await request.json().catch(() => null));
      if (parsed === null) return failure("bad_request", 400);

      const existing = activeByUser.get(person.userId);
      if (existing !== undefined && existing.rundownId !== parsed.rundownId) {
        return failure("busy", 409);
      }
      const client = context.clientOf(person.userId);
      if (client === null) return failure("unreachable", 503);

      if (existing !== undefined) stopFor(person.userId, false);

      const handle = client.prompter(parsed.rundownId);
      let closed = false;
      let emitOnClose = true;

      const run: ActiveRun = {
        rundownId: parsed.rundownId,
        status: {
          rundownId: parsed.rundownId,
          path: parsed.folder,
          encoding: parsed.encoding,
          replaced: 0,
          failure: null,
        },
        stop(emitNull) {
          if (closed) return;
          closed = true;
          emitOnClose = emitNull;
          offRefused();
          writer.stop();
          handle.close();
        },
      };
      activeByUser.set(person.userId, run);

      const offRefused = handle.status.subscribe((feedStatus) => {
        if (feedStatus.feed !== "refused") return;
        if (activeByUser.get(person.userId) === run)
          activeByUser.delete(person.userId);
        run.stop(true);
      });

      const writer = createPrompterFilesWriter({
        rundownId: parsed.rundownId,
        folder: parsed.folder,
        encoding: parsed.encoding,
        feed: feedFromPrompterHandle(handle),
        clock: context.clock,
        onStatus(status) {
          if (status === null) {
            if (activeByUser.get(person.userId) === run)
              activeByUser.delete(person.userId);
            if (!closed) {
              closed = true;
              offRefused();
              handle.close();
            }
            if (emitOnClose && activeByUser.size === 0) sendStatus(null);
            return;
          }
          if (activeByUser.get(person.userId) === run) run.status = status;
          sendStatus(status);
        },
      });

      if (!closed && handle.status.get().feed === "refused") {
        if (activeByUser.get(person.userId) === run)
          activeByUser.delete(person.userId);
        run.stop(true);
      }

      return noContent();
    },
  };
}
