// File-handling launchQueue consumer: filters extensions, enforces a strict byte cap, and lazily imports the opener.
import type { ImportFile } from "../import/open-files.ts";

export const LAUNCH_QUEUE_MAX_BYTES = 20 * 1024 * 1024;
export const LAUNCH_QUEUE_EXTENSIONS = [".fdx", ".fountain", ".ink"] as const;

export interface LaunchFileHandle {
  readonly kind?: "file" | "directory";
  readonly name?: string;
  getFile(): Promise<File>;
}

export interface LaunchParams {
  readonly files?: readonly LaunchFileHandle[];
}

export interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void | Promise<void>): void;
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return LAUNCH_QUEUE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Reads launched `.fdx`, `.fountain`, and `.ink` files within `maxBytes` and hands them to the lazy file opener.
 * Never imports `@manent/formats` or the file opener unless at least one valid file is accepted.
 */
export async function processLaunchFiles(
  handles: readonly LaunchFileHandle[],
  options?: {
    readonly maxBytes?: number;
    readonly open?: (files: readonly ImportFile[]) => Promise<void>;
  },
): Promise<number> {
  const maxBytes = options?.maxBytes ?? LAUNCH_QUEUE_MAX_BYTES;
  const accepted: ImportFile[] = [];
  for (const handle of handles) {
    if (handle.kind === "directory") continue;
    let file: File;
    try {
      file = await handle.getFile();
    } catch {
      continue;
    }
    if (!hasAllowedExtension(file.name)) continue;
    if (file.size > maxBytes) continue;
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      continue;
    }
    if (bytes.byteLength > maxBytes) continue;
    accepted.push({ name: file.name, bytes });
  }
  if (accepted.length === 0) return 0;
  if (options?.open !== undefined) {
    await options.open(accepted);
  } else {
    const { fileOpener } = await import("../import/open-files.ts");
    await fileOpener()?.open(accepted);
  }
  return accepted.length;
}

/** Registers the window's Launch Handler API consumer when available; returns true if registered. */
export function registerLaunchQueue(options?: {
  readonly launchQueue?: LaunchQueue | null;
  readonly maxBytes?: number;
  readonly open?: (files: readonly ImportFile[]) => Promise<void>;
}): boolean {
  const queue =
    options && "launchQueue" in options
      ? options.launchQueue
      : typeof window !== "undefined"
        ? ((Reflect.get(window, "launchQueue") as LaunchQueue | undefined) ??
          null)
        : null;
  if (
    queue === null ||
    queue === undefined ||
    typeof queue.setConsumer !== "function"
  )
    return false;
  queue.setConsumer((params) => {
    const files = params.files;
    if (files === undefined || files.length === 0) return;
    void processLaunchFiles(files, options);
  });
  return true;
}
