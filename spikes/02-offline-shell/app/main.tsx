import { createRoot } from "react-dom/client";

// Replaced by build.ts with the build ID.
declare const BUILD_ID: string;

declare global {
  interface Window {
    __loadId: string;
  }
}

window.__loadId = crypto.randomUUID();
document.body.dataset.build = BUILD_ID;

function Shell() {
  return (
    <main>
      <p id="shell">Manent shell {BUILD_ID}</p>
      <textarea id="edit" />
    </main>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");
createRoot(root).render(<Shell />);

void navigator.serviceWorker.register("/sw.js");
