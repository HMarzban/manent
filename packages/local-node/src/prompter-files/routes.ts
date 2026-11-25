// Local-node HTTP routes for starting, inspecting, and stopping prompter file writing.
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
    folder.includes("\0")
  )
    return null;
  if (encoding !== "utf-8" && encoding !== "windows-1252") return null;
  return { rundownId, folder, encoding };
}

/** Registers GET/POST/DELETE `/api/local/prompter-files` on the desktop local node. */
export function prompterFilesRoutes(
  context: LocalRouteContext,
): Record<string, LocalRoute> {
  let active: ActiveRun | null = null;

  const sendStatus = (status: PrompterFilesStatus | null): void => {
    context.shell.shell.send({ v: 1, t: "prompter_files", status });
  };

  const stopActive = (emitNull: boolean): void => {
    if (active === null) {
      if (emitNull) sendStatus(null);
      return;
    }
    const current = active;
    active = null;
    current.stop(emitNull);
  };

  context.onClose(() => stopActive(false));

  return {
    "GET /api/local/prompter-files"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      return Response.json(active?.status ?? null);
    },

    "DELETE /api/local/prompter-files"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      stopActive(true);
      return noContent();
    },

    async "POST /api/local/prompter-files"(request) {
      const person = readPerson(request, context);
      if (person === null) return failure("unauthenticated", 401);
      const parsed = readStartRequest(await request.json().catch(() => null));
      if (parsed === null) return failure("bad_request", 400);

      if (active !== null && active.rundownId !== parsed.rundownId) {
        return failure("busy", 409);
      }
      const client = context.clientOf(person.userId);
      if (client === null) return failure("unreachable", 503);

      if (active !== null) stopActive(false);

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
      active = run;

      const offRefused = handle.status.subscribe((feedStatus) => {
        if (feedStatus.feed !== "refused") return;
        if (active === run) active = null;
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
            if (active === run) active = null;
            if (!closed) {
              closed = true;
              offRefused();
              handle.close();
            }
            if (emitOnClose) sendStatus(null);
            return;
          }
          if (active === run) run.status = status;
          sendStatus(status);
        },
      });

      if (!closed && handle.status.get().feed === "refused") {
        if (active === run) active = null;
        run.stop(true);
      }

      return noContent();
    },
  };
}
