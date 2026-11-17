import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api.ts";
import { createAppRouter, createPersonStore } from "./router.tsx";
import { createTabSession } from "./session.ts";
import type { TabStorage } from "./session.ts";

function tabStorage(): TabStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const usePerson = createPersonStore(createTabSession(tabStorage()));
const api = createApi(fetch, () => usePerson.getState().person?.token ?? null);
const router = createAppRouter({ api, fetchFn: fetch, usePerson });
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
