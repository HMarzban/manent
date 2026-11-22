// The page profiles of engine 2: engine 1's, with a cast list under each multi-camera scene heading and each
// animation speech numbered.
import type { PageProfile } from "../../page-profile.ts";
import { keyedProfile, profileFor as profileForV1 } from "../v1/profile.ts";
import type { ProfileOptions } from "../v1/profile.ts";

/** The engine version this folder is. */
const VERSION = 2;

/** The deeply frozen profile of a format, as engine 1 gives it but for its version and furniture; null only for "ink". */
export function profileFor(
  format: string,
  options: ProfileOptions = {},
): PageProfile | null {
  const base = profileForV1(format, options);
  if (base === null) return null;
  const { key: _, ...rest } = base;
  return keyedProfile({
    ...rest,
    engineVersion: VERSION,
    furniture: {
      ...rest.furniture,
      castLists: format === "multicam",
      speechesNumbered: format === "animation",
    },
  });
}
