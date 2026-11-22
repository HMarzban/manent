// bun tools/desktop/check-size.ts <installer>: prints the installer's size against its budget, and exits 1 only on a hard fail.

const MB = 1_000_000;
const BUDGET_BYTES = 250 * MB;
const HARD_FAIL_BYTES = 400 * MB;

export function sizeVerdict(
  bytes: number,
): "within" | "over_budget" | "hard_fail" {
  if (bytes <= BUDGET_BYTES) return "within";
  return bytes <= HARD_FAIL_BYTES ? "over_budget" : "hard_fail";
}

if (import.meta.main) {
  const path = process.argv[2];
  const file = path === undefined ? null : Bun.file(path);
  if (file === null || !(await file.exists())) {
    console.error("usage: bun tools/desktop/check-size.ts <installer>");
    process.exit(1);
  }
  const verdict = sizeVerdict(file.size);
  console.log(`${(file.size / MB).toFixed(1)} MB ${verdict}`);
  if (verdict === "hard_fail") process.exit(1);
}
