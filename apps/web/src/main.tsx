import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api.ts";
import { createPersonStore } from "./person-store.ts";
import { createAppRouter } from "./router.tsx";
import type { TabStorage } from "./session.ts";

function tabStorage(): TabStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    // the browser refuses tab storage: the person is kept for this page load only
    return null;
  }
}

const root = document.getElementById("root");
if (root === null) throw new Error("the page has no #root element");

const usePerson = createPersonStore(tabStorage());
const api = createApi({
  fetch,
  getToken: () => usePerson.getState().person?.token ?? null,
});
const router = createAppRouter({ api, fetch, usePerson });
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
