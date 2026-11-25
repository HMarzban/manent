// Library authority: Trash service and push rules for folders and private indexes.
export { checkFolderPush, isWorkspaceIndex } from "./folder-rules.ts";
export {
  checkPrivateIndexPush,
  createLibraryPushHooks,
  isPrivateIndex,
} from "./private-index-rules.ts";
export {
  TRASH_KEEP_MS,
  TRASH_SWEEP_INTERVAL_MS,
  createTrashService,
} from "./service.ts";
export type {
  TrashOutcome,
  TrashRefusal,
  TrashService,
  TrashServiceOptions,
} from "./service.ts";
