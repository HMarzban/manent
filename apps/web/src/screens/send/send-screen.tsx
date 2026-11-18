import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/s/$docId/send/$form");

export function SendScreen() {
  const { form }: { form: string } = route.useParams();
  return <h1 tabIndex={-1}>{form}</h1>;
}
