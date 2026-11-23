// What a person may do with a document: what each source grants, joined.
import type { Storage } from "@manent/storage";
import { CAPABILITIES } from "@manent/sync-protocol";
import type { Capability } from "@manent/sync-protocol";

/** Who asks about which document, and the role row their access to it is read from. */
export interface CapabilityGrant {
  storage: Storage;
  userId: string;
  docId: string;
  stored: { role: string; capabilities: readonly string[] };
}

/** One source of capabilities; it only adds to what the others grant. */
export type CapabilitySource = (
  grant: CapabilityGrant,
) => readonly Capability[];

const isCapability = (value: string): value is Capability =>
  CAPABILITIES.some((capability) => capability === value);

/** The capabilities stored with the person's role. */
const roleCapabilities: CapabilitySource = ({ stored }) =>
  stored.capabilities.filter(isCapability);

/** Asked in order; append a source on its own line. */
export const CAPABILITY_SOURCES: readonly CapabilitySource[] = Object.freeze([
  roleCapabilities,
]);

/** What every source grants, each capability once, in the order first granted. */
export function grantedCapabilities(grant: CapabilityGrant): Capability[] {
  return [...new Set(CAPABILITY_SOURCES.flatMap((source) => source(grant)))];
}
