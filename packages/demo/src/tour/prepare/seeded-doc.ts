// A seeded document read and changed as one of the demo's people, for the Tour's preparations.
import { scriptSettings } from "@manent/crdt";
import type {
  ProductionState,
  RevisionSetView,
  TourPrepareResponse,
} from "@manent/sync-protocol";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { SeedDriver, SeedProduction } from "../../seed/driver.ts";

export const READY: TourPrepareResponse = Object.freeze({ ok: true });
export const USED: TourPrepareResponse = Object.freeze({
  ok: false,
  reason: "used",
});

/** The driver's production routes; SeedDriverError "unavailable" on a server without them. */
export function productionOf(driver: SeedDriver): SeedProduction {
  if (driver.production === null)
    throw new SeedDriverError("unavailable", "the server has no production");
  return driver.production;
}

/** The production state of the seeded document `key`, read as `userId`. */
export const stateOf = (
  driver: SeedDriver,
  userId: string,
  key: string,
): Promise<ProductionState> =>
  productionOf(driver).state(userId, seedDoc(key).docId);

/** The first revision of `colour` ("blue") that was issued; null while none is. */
export const issuedSet = (
  state: ProductionState,
  colour: string,
): RevisionSetView | null =>
  state.sets.find((s) => s.colour === colour && s.issuedAt !== null) ?? null;

/**
 * As `userId`, sets the script setting `setting` of the seeded document `key` to `value` when
 * another value is stored. Both callers' `value` is the setting's default, which a script that
 * never stored the setting holds already. SeedDriverError "refused" when the server refuses it.
 */
export async function settleSetting(
  driver: SeedDriver,
  userId: string,
  change: { key: string; setting: string; value: string },
): Promise<TourPrepareResponse> {
  const session = await driver.open(userId, seedDoc(change.key).docId);
  try {
    const held = scriptSettings(session.doc).entries()[change.setting];
    if (held === undefined || held === change.value) return READY;
    if ((await session.set(change.setting, change.value)) === "refused")
      throw new SeedDriverError(
        "refused",
        `${change.setting} on ${change.key}`,
      );
    return READY;
  } finally {
    await session.close();
  }
}
