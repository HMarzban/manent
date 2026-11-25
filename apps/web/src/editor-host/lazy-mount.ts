// A mount whose editor is loaded apart from the entry: the placeholder stands in the page until it has loaded.
import type { EditorMount } from "./mount.ts";
import { placeholderMount } from "./placeholder-mount.ts";

/**
 * Starts `load` at once. Until it settles a mount draws the placeholder; then the placeholder goes and the loaded mount
 * draws the editor, unless the mount was disposed first, which leaves the element empty. Once loaded, a mount draws the
 * editor at once.
 */
export function createLazyMount(load: () => Promise<EditorMount>): EditorMount {
  let loaded: EditorMount | null = null;
  const loading = load().then((mount) => {
    loaded = mount;
    return mount;
  });
  return {
    mount(ports) {
      if (loaded !== null) return loaded.mount(ports);
      let dispose = placeholderMount.mount(ports);
      let disposed = false;
      void loading.then((mount) => {
        if (disposed) return;
        const releasePlaceholder = dispose;
        // mount first so a loaded editor that still waits on sync can adopt the existing placeholder in place
        const nextDispose = mount.mount(ports);
        releasePlaceholder();
        dispose = nextDispose;
      });
      return () => {
        disposed = true;
        dispose();
      };
    },
  };
}
