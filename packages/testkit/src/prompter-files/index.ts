// Spawns a separate-process reader that polls a prompter folder without sleeping.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PrompterObservedContent {
  readonly content: string;
  readonly count: number;
}

export interface PrompterReaderResult {
  readonly totalReads: number;
  readonly files: Readonly<Record<string, readonly PrompterObservedContent[]>>;
}

export interface PrompterFolderReader {
  readonly ready: Promise<void>;
  stop(): Promise<PrompterReaderResult>;
  kill(): void;
}

export interface PrompterFolderReaderOptions {
  readonly doneFile?: string;
}

const DEFAULT_DONE_FILE = ".done";
const READY_MARKER = "READY\n";
const READER_SCRIPT = join(import.meta.dir, "reader.ts");

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.byteLength;
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Starts a child Bun process that lists and reads every visible file in `folder`
 * in a tight loop with no sleep until `stop()` writes the sentinel file.
 */
export function startPrompterFolderReader(
  folder: string,
  options: PrompterFolderReaderOptions = {},
): PrompterFolderReader {
  const doneFile = options.doneFile ?? DEFAULT_DONE_FILE;
  const proc = Bun.spawn([process.execPath, READER_SCRIPT, folder, doneFile], {
    stdout: "pipe",
    stderr: "pipe",
  });

  let resolveReady!: () => void;
  let rejectReady!: (reason: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const stdoutDone = (async (): Promise<string> => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const tailChunks: Uint8Array[] = [];
    let preamble = "";
    let signalled = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signalled) {
          tailChunks.push(value);
          continue;
        }
        preamble += decoder.decode(value, { stream: true });
        const newline = preamble.indexOf("\n");
        if (newline !== -1) {
          const firstLine = preamble.slice(0, newline + 1);
          if (firstLine !== READY_MARKER) {
            throw new Error(
              `Unexpected reader preamble: ${JSON.stringify(firstLine)}`,
            );
          }
          signalled = true;
          resolveReady();
          const rest = preamble.slice(newline + 1);
          if (rest.length > 0) {
            tailChunks.push(new TextEncoder().encode(rest));
          }
        }
      }
      if (!signalled) {
        throw new Error("Prompter reader exited before signalling readiness");
      }
      return new TextDecoder().decode(concatChunks(tailChunks));
    } catch (caught) {
      if (!signalled) rejectReady(caught);
      throw caught;
    } finally {
      reader.releaseLock();
    }
  })();

  let stopped = false;

  return {
    ready,
    async stop(): Promise<PrompterReaderResult> {
      if (!stopped) {
        stopped = true;
        writeFileSync(join(folder, doneFile), "done\n", "utf8");
      }
      const [exitCode, stdoutText, stderrText] = await Promise.all([
        proc.exited,
        stdoutDone,
        new Response(proc.stderr).text(),
      ]);
      if (exitCode !== 0) {
        throw new Error(
          `Prompter reader exited with status ${exitCode}: ${stderrText.trim()}`,
        );
      }
      return JSON.parse(stdoutText.trim()) as PrompterReaderResult;
    },
    kill(): void {
      if (stopped) return;
      stopped = true;
      try {
        proc.kill();
      } catch {
        // Already exited.
      }
    },
  };
}
