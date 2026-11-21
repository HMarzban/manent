// Generators shared by the web app's property tests.
import fc from "fast-check";

/** `valid` nine times in ten, else one of `others`: near-valid input that still reaches what a reader accepts. */
export const mostly = <T>(
  valid: fc.Arbitrary<T>,
  ...others: fc.Arbitrary<unknown>[]
): fc.Arbitrary<unknown> =>
  fc.oneof(
    { weight: 9, arbitrary: valid },
    ...others.map((arbitrary) => ({ weight: 1, arbitrary })),
  );
