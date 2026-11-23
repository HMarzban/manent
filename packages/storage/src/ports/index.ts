// The storage ports: one repository per aggregate, a unit of work, and the numbers they keep to.
// `kind`, `role` and capabilities are plain strings here: storage does not know the wire.
export * from "./adoptions.ts";
export * from "./api-keys.ts";
export * from "./checkpoints.ts";
export * from "./directory.ts";
export * from "./doc-file.ts";
export * from "./doc-log.ts";
export * from "./generations.ts";
export * from "./history.ts";
export * from "./measures.ts";
export * from "./outbox.ts";
export * from "./private-copy.ts";
export * from "./prompter.ts";
export * from "./replays.ts";
export * from "./search.ts";
export * from "./sharing.ts";
export * from "./storage-error.ts";
export * from "./storage.ts";
export * from "./trash.ts";
export * from "./versions.ts";
export * from "./workspace.ts";
