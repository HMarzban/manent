import { useEffect } from "react";
import { focusHeading } from "../../focus.ts";
import { TEXT, pageTitle } from "../../text.ts";

export function LibraryScreen(props: { personName: string | null }) {
  const { personName } = props;

  useEffect(() => {
    focusHeading(document);
  }, []);

  useEffect(() => {
    document.title = pageTitle(TEXT.libraryTitle, personName);
  }, [personName]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="flex items-center gap-4">
        <h1 tabIndex={-1} className="text-2xl font-semibold outline-none">
          {TEXT.libraryTitle}
        </h1>
      </header>
      <section aria-labelledby="projects-heading" className="mt-6">
        <h2 id="projects-heading" className="text-lg font-medium">
          {TEXT.projects}
        </h2>
        <p className="mt-2 text-neutral-600">{TEXT.libraryEmpty}</p>
      </section>
    </div>
  );
}
