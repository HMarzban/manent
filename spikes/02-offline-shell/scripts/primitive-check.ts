// Lists every package a bun.lock installs and names those that are a second primitive library
// beside Base UI. Exits 1 when there is one.
import { join, resolve } from "node:path";

const NAMES: readonly string[] = ["cmdk", "radix-ui", "downshift", "ariakit", "react-aria", "react-aria-components"];
const SCOPES: readonly string[] = ["@radix-ui/", "@react-aria/", "@react-stately/", "@headlessui/", "@ariakit/", "@reach/"];

function isOffender(name: string): boolean {
  return NAMES.includes(name) || SCOPES.some((scope) => name.startsWith(scope));
}

// A lock entry's first element is "<name>@<version>"; a scoped name has its own leading "@".
function readPackages(lock: string): string[] {
  const raw: unknown = Bun.JSONC.parse(lock);
  const packages = typeof raw === "object" && raw !== null && "packages" in raw ? raw.packages : null;
  if (typeof packages !== "object" || packages === null) throw new TypeError("bun.lock has no packages table");
  const names = new Set<string>();
  for (const entry of Object.values(packages)) {
    const spec: unknown = Array.isArray(entry) ? entry[0] : null;
    if (typeof spec !== "string" || spec.lastIndexOf("@") <= 0) throw new TypeError(`bun.lock holds an entry without a name: ${JSON.stringify(entry)}`);
    names.add(spec.slice(0, spec.lastIndexOf("@")));
  }
  return [...names].toSorted();
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error("Usage: bun scripts/primitive-check.ts <dir with a bun.lock>.");
    process.exit(2);
  }
  const packages = readPackages(await Bun.file(join(resolve(dir), "bun.lock")).text());
  const offenders = packages.filter(isOffender);
  console.log(JSON.stringify({ dir, packages, offenders }, null, 2));
  if (offenders.length > 0) process.exit(1);
}
