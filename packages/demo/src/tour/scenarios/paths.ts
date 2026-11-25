// App path helpers for Tour scenarios beyond single-document routes.
import { seedProject } from "../../seed/catalogue.ts";

/** The app path of a seeded project route such as `/p/<projectId>/board`. */
export function projectPath(projectKey: string, route: "board"): string {
  return `/p/${seedProject(projectKey).projectId}/${route}`;
}
