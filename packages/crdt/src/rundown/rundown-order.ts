import { orderKeyBetween } from "../order-key.ts";

export function orderBetween(
  before: string | null,
  after: string | null,
): string {
  return orderKeyBetween(before, after);
}
