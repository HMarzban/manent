// The home, documents and updates the storage contract drives.
import type { AppendItem, Home } from "../ports/index.ts";

export const HOME: Home = {
  kind: "project",
  id: "0b9f3c1e-6d2a-4e8b-9f1a-2c3d4e5f6a7b",
};
export const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
export const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
export const DOC3 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cf";

export const item = (n: number): AppendItem => ({
  docId: DOC,
  generation: 1,
  update: new Uint8Array([n]),
  userId: "sam",
  origin: "edit",
  clocks: [{ clientId: 7, clock: n }],
});

export const bytes = (...values: number[]): Uint8Array =>
  new Uint8Array(values);
