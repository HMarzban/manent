// The services the project archive is written with: those of the person whose command handlers were made last.
import type { PersonServices } from "../services/ports.ts";

let person: PersonServices | null = null;

/** Null until a person's command handlers are made. */
export const archiveSource: {
  get(): PersonServices | null;
  set(services: PersonServices): void;
} = Object.freeze({
  get: () => person,
  set: (services: PersonServices) => {
    person = services;
  },
});
