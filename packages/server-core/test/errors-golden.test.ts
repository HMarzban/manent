import { expect, test } from "bun:test";
import { CODE } from "@manent/sync-protocol";
import { SYNC_ERRORS } from "../src/index.ts";

test("every code and message this server sends is pinned", () => {
  expect(SYNC_ERRORS).toEqual({
    rate_limited: 4429,
    document_full: 4429,
    busy: 4429,
    too_many_client_ids: 4413,
    deleted: 4410,
    forbidden: 4403,
    prompter_unavailable: 4403,
    read_only_role: 4403,
    too_old: 4408,
    client_id_taken: 4400,
    not_subscribed: 4403,
    generation_moved: 4409,
    bad_update: 4400,
    foreign_client_id: 4400,
    incomplete: 4400,
    invalid: 4422,
    too_large: 4413,
    storage_failed: 1011,
    unknown_frame: 4400,
    bad_value: 4423,
    unknown_key: 4423,
    locked: 4423,
  });
  for (const message of Object.keys(SYNC_ERRORS))
    expect(message).toMatch(/^[a-z_]+$/);
  expect(CODE.STORAGE_FAILED).toBe(1011);
});
