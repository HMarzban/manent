// The Tour's preparations, run on the live server as the scenario's person.
import { TOUR_PREPARATIONS } from "@manent/demo";
import type { SeedDriver, SeedTime } from "@manent/demo";
import type { TourPrepareResponse } from "@manent/sync-protocol";
import { probeSeedCapabilities } from "../seed/capabilities.ts";
import { createSeedDriver } from "../seed/driver.ts";
import type { LiveTarget } from "../seed/driver.ts";
import { SEED_ORIGIN } from "../seed/server.ts";

/**
 * Runs the preparation `id` over one driver on `live`, made at the first run: its people keep
 * their sockets from one preparation to the next. A null id has nothing to prepare.
 */
export function createPreparations(options: {
  live: LiveTarget;
  random: () => number;
}): (id: string | null, time: SeedTime) => Promise<TourPrepareResponse> {
  const { live, random } = options;
  let driver: Promise<SeedDriver> | null = null;
  const driverOf = (): Promise<SeedDriver> => {
    driver ??= probeSeedCapabilities(live, SEED_ORIGIN).then(
      () => createSeedDriver({ target: live, random }),
      (error: unknown) => {
        driver = null;
        throw error;
      },
    );
    return driver;
  };
  return async (id, time) => {
    if (id === null) return { ok: true };
    const preparation = TOUR_PREPARATIONS.find((p) => p.id === id);
    if (preparation === undefined) return { ok: false, reason: "unknown" };
    return preparation.run(await driverOf(), time);
  };
}
