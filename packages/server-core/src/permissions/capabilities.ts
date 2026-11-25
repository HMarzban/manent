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

/** Refines the capabilities granted so far (for example, overriding role capabilities from a project table). */
export type CapabilityOverride = (
  grant: CapabilityGrant,
  current: readonly Capability[],
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

/** Applied in order after CAPABILITY_SOURCES; append an override on its own line. */
export const CAPABILITY_OVERRIDES: readonly CapabilityOverride[] =
  Object.freeze([]);

/** What every source grants, refined by overrides, each capability once, in the order first granted. */
export function grantedCapabilities(grant: CapabilityGrant): Capability[] {
  let caps = [
    ...new Set(CAPABILITY_SOURCES.flatMap((source) => source(grant))),
  ];
  for (const override of CAPABILITY_OVERRIDES)
    caps = [...new Set(override(grant, caps))];
  return caps;
}
