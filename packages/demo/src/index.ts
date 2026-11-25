// Demo people and workspaces, the demo sign-in, the Tour and the seed.
export {
  SeedTextError,
  blocksToText,
  parseSeedText,
} from "./content/markup.ts";
export type { SeedBlock, SeedPassage } from "./content/markup.ts";
// from fit.ts and guide.ts, not generate/index.ts: the banks it carries stay out of every bundle that imports the entry
export type { PageMeter, SeedLayout } from "./generate/fit.ts";
export { SeedBuildError } from "./generate/guide.ts";
export type {
  Beat,
  DialogueEntry,
  GeneratedIssue,
  LineIntent,
  ProseGuide,
  StyleGuide,
  StyleRules,
  VarietyStory,
} from "./generate/guide.ts";
export {
  DEMO_PEOPLE,
  DEMO_USER_IDS,
  DEMO_WORKSPACES,
  demoPersonName,
} from "./people.ts";
export type { DemoPerson, DemoUserId, DemoWorkspace } from "./people.ts";
export { GENERATED_MEMBERS } from "./people/members.ts";
export type { GeneratedMember } from "./people/members.ts";
export {
  SEED_DOCS,
  SEED_PROJECTS,
  docPath,
  draftLinkPath,
  heavyHomes,
  seedDoc,
  seedDraftToken,
  seedProject,
} from "./seed/catalogue.ts";
export type {
  SeedDoc,
  SeedProject,
  SeedWorkspaceId,
} from "./seed/catalogue.ts";
export type { SeedComments } from "./seed/capabilities/comments.ts";
export type { SeedPrivateCopies } from "./seed/capabilities/private-copies.ts";
export type { SeedPrompter } from "./seed/capabilities/prompter.ts";
export type { SeedRundowns } from "./seed/capabilities/rundowns.ts";
export type { SeedSeries } from "./seed/capabilities/series.ts";
export type { SeedSharing } from "./seed/capabilities/sharing.ts";
export type { SeedStartFrom } from "./seed/capabilities/start-from.ts";
export type { SeedWritersMaterial } from "./seed/capabilities/writers-material.ts";
export { SEED_CAPABILITIES, SeedDriverError } from "./seed/driver.ts";
export type {
  HeadlessLink,
  SeedCapability,
  SeedDriver,
  SeedProduction,
  SeedSession,
} from "./seed/driver.ts";
export { createRng, seededIdSource } from "./seed/rng.ts";
export type { Rng } from "./seed/rng.ts";
export { buildSeed, DEMO_SEED } from "./seed/seed.ts";
export type {
  SeedContext,
  SeedEntry,
  SeedManifest,
  SeedOptions,
  SeedStep,
  SeedWorkspace,
  SkippedAction,
} from "./seed/seed.ts";
export { toBlockJSON } from "./seed/story.ts";
export type { Story } from "./seed/story.ts";
export { SeedTimeError, createSeedTime } from "./seed/time.ts";
export type { SeedTime } from "./seed/time.ts";
export { writerLines } from "./seed/writer-lines.ts";
export { createDemoDirectory, createDemoSignIn } from "./sign-in.ts";
export { bindRefusal } from "./terminal.ts";
export {
  TOUR,
  TOUR_FEATURES,
  TOUR_GROUPS,
  TOUR_ISSUE_CODES,
  TOUR_PREPARATIONS,
  TOUR_RELEASED,
  TOUR_TARGETS,
  isShown,
  validateTour,
} from "./tour/index.ts";
export type {
  TourFeature,
  TourFile,
  TourGroup,
  TourIssue,
  TourIssueCode,
  TourPreparation,
  TourScenario,
  TourTarget,
  TourWindow,
} from "./tour/index.ts";
export * from "./writers/index.ts";
