// A kind of project as the Library shows it: its word and its icon.
import { NEW_PROJECT_CARDS } from "@manent/ui";
import {
  BookOpenIcon,
  ClapperboardIcon,
  DramaIcon,
  Gamepad2Icon,
  HeadphonesIcon,
  MicVocalIcon,
  NewspaperIcon,
  TvIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectKind } from "../../services/ports.ts";

const KIND_ICONS: Readonly<Record<ProjectKind, LucideIcon>> = Object.freeze({
  film: ClapperboardIcon,
  series: TvIcon,
  show: MicVocalIcon,
  news: NewspaperIcon,
  podcast: HeadphonesIcon,
  book: BookOpenIcon,
  game: Gamepad2Icon,
  stage_play: DramaIcon,
});

/** The kind's word, as its New project card names it. */
export function kindLabel(kind: ProjectKind): string {
  return NEW_PROJECT_CARDS.find((card) => card.kind === kind)?.label ?? "";
}

/** The kind's icon, beside the kind's word or a title, so it is hidden from assistive technology. */
export function KindIcon(props: {
  kind: ProjectKind;
  className?: string;
}): ReactNode {
  const Icon = KIND_ICONS[props.kind];
  return <Icon aria-hidden="true" className={props.className} />;
}
