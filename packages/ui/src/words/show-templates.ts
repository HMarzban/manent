// Words of Show and News reusable templates: Save template dialog, Project settings → Templates, and Library New rundown choices.

export const SHOW_TEMPLATE_WORDS = Object.freeze({
  heading: "Templates",
  saveCommand: "Save template…",
  saveAction: "Save template",
  nameLabel: "Name",
  whereLabel: "Where to use it",
  projectDefault: "This project's default",
  sharedInWorkspace: (workspace: string): string => `Shared in ${workspace}`,
  projectDefaultHelp: (project: string): string =>
    `Every new rundown in ${project} starts from this.`,
  sharedInWorkspaceHelp: (workspace: string): string =>
    `Available in every Show and News project in ${workspace}.`,
  rundownStripNote:
    "Keeps rows, headers and columns. Clears dates, timings and previous values.",
  scriptStripNote:
    "Keeps structure and headings. Clears comments and revision marks.",
  defaultRundown: "Default rundown",
  defaultScript: "Default script",
  noneStartsBlank: "None — starts blank",
  clear: "Clear",
  useAsProjectDefault: "Use as this project's default",
  blankRundown: "Blank rundown",
  moreNewRundownChoices: "More new rundown choices",
  savedProjectDefault: (name: string): string =>
    `Saved '${name}' as this project's default.`,
  savedInWorkspace: (name: string, workspace: string): string =>
    `Saved '${name}' in ${workspace}.`,
  clearedDefaultRundown: "Cleared the default rundown.",
  clearedDefaultScript: "Cleared the default script.",
  removeConfirm: (name: string): string => `Remove '${name}'?`,
});
