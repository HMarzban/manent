// The editor of a document beside the page: its own control, which commands reach while it is the page focused last.
import type { ActionResult } from "@manent/editor";
import type { PersonServices } from "../services/ports.ts";
import type { PageRequest } from "./command-actions.ts";
import { createEditorControl } from "./control.ts";
import type { EditorControl } from "./control.ts";
import type { EditorMount } from "./mount.ts";

const MAIN_PAGE = "[data-editor-host]";

// what a command reaches while the editor beside is still loading
const NOTHING_TO_DO: ActionResult = Object.freeze({
  ok: false,
  reason: "nothing_to_do",
});

/**
 * Draws `services`' editor of `docId` into `element` with its own control, its caret at `at`'s block once it opens
 * when `at` is given. From the moment its page takes focus until the page's own editor takes it again, the person's
 * control reaches it, so a command run from the palette or a menu acts on it. Returns the disposer.
 */
export function mountBesideEditor(
  options: Parameters<EditorMount["mount"]>[0] & {
    services: PersonServices;
    at: { blockId: string } | null;
  },
): () => void {
  const { services, at, ...ports } = options;
  const own = createEditorControl();
  let going = at;
  const control: EditorControl = {
    ...own,
    attach(editor) {
      const detach = own.attach(editor);
      if (going !== null)
        own.run({ kind: "go_to", blockId: going.blockId, offset: 0 });
      going = null;
      return detach;
    },
  };
  const unmount = services.besideMount(control).mount(ports);
  const forwarder = {
    run: (request: PageRequest): ActionResult =>
      own.run(request) ?? NOTHING_TO_DO,
    zoomPercent: () => own.zoomPercent(),
    showTitlePage: () => own.showTitlePage(),
  };
  let detachForwarder: (() => void) | null = null;
  const release = (): void => {
    detachForwarder?.();
    detachForwarder = null;
  };
  // focus anywhere else, such as the palette or a menu, leaves the commands where they were
  const onFocusIn = (event: FocusEvent): void => {
    const { target } = event;
    if (!(target instanceof Element)) return;
    if (ports.element.contains(target))
      detachForwarder ??= services.editor.attach(forwarder);
    else if (target.closest(MAIN_PAGE) !== null) release();
  };
  const page = ports.element.ownerDocument;
  page.addEventListener("focusin", onFocusIn);
  return () => {
    page.removeEventListener("focusin", onFocusIn);
    release();
    unmount();
  };
}
