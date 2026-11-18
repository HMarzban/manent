import { getRouteApi } from "@tanstack/react-router";

const route = getRouteApi("/preferences/$pane");

export function PreferencesScreen() {
  const { pane }: { pane: string } = route.useParams();
  return <h1 tabIndex={-1}>{pane}</h1>;
}
