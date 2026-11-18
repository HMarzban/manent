import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/s/$docId");

export function DocumentScreen() {
  const { docId }: { docId: string } = route.useParams();
  return <h1 tabIndex={-1}>{docId}</h1>;
}
