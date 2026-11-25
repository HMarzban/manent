// Permissions authority: capability sources, project can_also reader/override, and push-rule hooks.
export {
  CAPABILITY_OVERRIDES,
  CAPABILITY_SOURCES,
  grantedCapabilities,
} from "./capabilities.ts";
export type {
  CapabilityGrant,
  CapabilityOverride,
  CapabilitySource,
} from "./capabilities.ts";
export {
  canAlsoOverride,
  readCanAlso,
  readProjectCanAlso,
} from "./can-also.ts";
export type { CanAlsoEntry } from "./can-also.ts";
export {
  checkCanAlsoPush,
  createCanAlsoHooks,
  isProjectIndex,
} from "./can-also-rule.ts";
