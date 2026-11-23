// What the driver routes answer, and what a client sends them.
import type { Identity } from "./http.ts";

/** POST /api/driver/take: taken while nobody drives, or while the current driver is `expectedDriverUserId` (null: nobody). */
export interface DriverTakeRequest {
  docId: string;
  expectedDriverUserId: string | null;
}

/** POST /api/driver/release: by the driver only. */
export interface DriverReleaseRequest {
  docId: string;
}

/** Who drives the script now; null: nobody. */
export interface DriverAnswer {
  driver: Identity | null;
}

/** A take refused with 409: someone other than the expected driver drives. */
export interface DriverTakenResponse {
  error: "driver_taken";
  driver: Identity;
}

/** The JSON data of CONTROL `driver_changed`; `at` is when the server changed it, in milliseconds since the epoch. */
export interface DriverChanged {
  docId: string;
  driver: Identity | null;
  at: number;
}
