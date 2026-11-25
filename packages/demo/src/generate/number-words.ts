// A chapter number written out in words, as a chapter heading has it.

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
] as const;

/** `n` in words with capitals ("Twenty-One"); throws a RangeError outside 1 to 99. */
export function numberInWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99)
    throw new RangeError(
      `a chapter number must be an integer from 1 to 99, not ${n}`,
    );
  if (n < 20) return ONES[n]!;
  const tens = TENS[Math.floor(n / 10)]!;
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]!}`;
}
