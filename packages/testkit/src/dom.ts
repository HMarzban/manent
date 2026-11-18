// A DOM for one test file. Evaluating this module registers happy-dom's globals, so it is the test file's
// first import: @base-ui/react reads `typeof document` once, when it is first evaluated, and never opens a popup otherwise.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll } from "bun:test";

const register = (): void => {
  if (GlobalRegistrator.isRegistered) return;
  GlobalRegistrator.register();
  // React's act() warns unless the environment says it is a test
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
};

register();

/** Keeps the DOM for the whole file: registered before its tests, unregistered after them. */
export function withDom(): void {
  beforeAll(register);
  afterAll(() => GlobalRegistrator.unregister());
}
