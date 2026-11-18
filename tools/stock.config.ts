// The stock components: which CLI, style and list they come from, and how their text is made ours.

export const STOCK = {
  cli: "shadcn@4.23.0",
  style: "base-mira",
  iconLibrary: "lucide",
  components: [
    "alert-dialog",
    "button",
    "collapsible",
    "context-menu",
    "dialog",
    "dropdown-menu",
    "field",
    "input",
    "input-group",
    "kbd",
    "label",
    "popover",
    "radio-group",
    "scroll-area",
    "select",
    "separator",
    "skeleton",
    "switch",
    "tabs",
    "textarea",
    "toggle",
    "toggle-group",
    "tooltip",
  ],
} as const;

/** What the temporary project may hold after the CLI ran; anything else is a dependency the stock set gained. */
export const STOCK_DEPENDENCIES = [
  "react",
  "react-dom",
  "@base-ui/react",
  "class-variance-authority",
  "cn",
  "lucide-react",
  "tailwindcss",
  "tw-animate-css",
  "shadcn",
] as const;

const UI_ALIAS = "@/components/ui/";

// group 1: `type` after `import`; 2: the clause; 3: the module; 4: the closing semicolon, if any
const IMPORT = new RegExp(
  String.raw`^import(\s+type)?\s+((?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)|[\w$]+)\s+from\s+"([^"]+)"(;?)`,
  "gm",
);
const BRACES = new RegExp(String.raw`\{([^}]*)\}`);
const DEFAULT_NAME = new RegExp(String.raw`^([\w$]+)\s*,`);

function rewriteImport(
  statement: string,
  typeOnly: string | undefined,
  clause: string,
  from: string,
): string {
  const path = from.startsWith(UI_ALIAS)
    ? `./${from.slice(UI_ALIAS.length)}.tsx`
    : from;
  const braces = BRACES.exec(clause);
  const members = (braces?.[1] ?? "")
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member !== "");
  const types = members.filter((member) => member.startsWith("type "));
  if (typeOnly !== undefined || types.length === 0)
    return statement.replace(`"${from}"`, `"${path}"`);
  const values = members.filter((member) => !member.startsWith("type "));
  const head = [
    DEFAULT_NAME.exec(clause)?.[1] ?? null,
    values.length > 0 ? `{ ${values.join(", ")} }` : null,
  ].filter((part) => part !== null);
  const names = types.map((member) => member.slice("type ".length).trim());
  return [
    ...(head.length > 0 ? [`import ${head.join(", ")} from "${path}";`] : []),
    `import type { ${names.join(", ")} } from "${path}";`,
  ].join("\n");
}

/**
 * The CLI's text with the component alias pointing at the sibling file (`"@/components/ui/button"` becomes `"./button.tsx"`)
 * and each inline `type` member moved into its own `import type` statement. Only import statements change.
 */
export function rewriteImports(source: string): string {
  return source.replace(
    IMPORT,
    (statement, typeOnly: string | undefined, clause: string, from: string) =>
      rewriteImport(statement, typeOnly, clause, from),
  );
}

/** SHA-256 of the text, in lower-case hex. */
export function hashFile(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}
