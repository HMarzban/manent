// Takes the instance lock of the directory it is given: prints "locked" and keeps it until killed, or prints "held" and exits.
import { acquireInstanceLock } from "../../src/index.ts";

const root = process.argv[2];
if (root === undefined) throw new TypeError("hold-lock needs a directory");
const taken = acquireInstanceLock(root);
if (taken.ok) {
  console.log("locked");
  // Keeps the process alive and the lock referenced: a lock nothing refers to is closed when it is collected.
  setInterval(() => taken.lock, 60_000);
} else {
  console.log("held");
}
