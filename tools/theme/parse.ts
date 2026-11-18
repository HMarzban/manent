// Reads CSS into its blocks of declarations, as much of the language as the theme file uses:
// comments, quoted strings, statements (`@import …;`, `@apply …;`) and nested at-rules.

export interface Declaration {
  property: string;
  value: string;
}

/**
 * One block of declarations. `selector` is null for an at-rule's own declarations (`@theme { … }`);
 * `atRules` holds the preludes of the enclosing at-rules, outermost first. Whitespace runs are one space.
 */
export interface CssRule {
  selector: string | null;
  atRules: readonly string[];
  declarations: readonly Declaration[];
}

const tidy = (text: string): string => text.replace(/\s+/g, " ").trim();
const COMMENT = new RegExp("\\/\\*[\\s\\S]*?\\*\\/", "g");

/** A statement inside a block: a declaration, or null for an at-statement or an empty one. */
const declaration = (statement: string): Declaration | null => {
  const text = tidy(statement);
  const colon = text.indexOf(":");
  if (text === "" || text.startsWith("@") || colon === -1) return null;
  return {
    property: text.slice(0, colon).trim(),
    value: text.slice(colon + 1).trim(),
  };
};

/** Reads the block that starts at `start` up to its closing brace; pushes it and its nested blocks, each when it closes. */
function readBlock(
  css: string,
  start: number,
  context: Omit<CssRule, "declarations">,
  rules: CssRule[],
): number {
  const declarations: Declaration[] = [];
  let statement = "";
  let depth = 0;
  let i = start;
  for (; i < css.length && !(css[i] === "}" && depth === 0); i++) {
    const c = css[i] ?? "";
    if (c === '"' || c === "'") {
      const close = css.indexOf(c, i + 1);
      const end = close === -1 ? css.length : close;
      statement += css.slice(i, end + 1);
      i = end;
    } else if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "{" && depth === 0) {
      const prelude = tidy(statement);
      const nested = prelude.startsWith("@")
        ? { selector: null, atRules: [...context.atRules, prelude] }
        : { selector: prelude, atRules: context.atRules };
      i = readBlock(css, i + 1, nested, rules);
      statement = "";
    } else if (c === ";" && depth === 0) {
      const found = declaration(statement);
      if (found !== null) declarations.push(found);
      statement = "";
    } else if (c !== '"' && c !== "'") statement += c;
  }
  const last = declaration(statement);
  if (last !== null) declarations.push(last);
  if (declarations.length > 0) rules.push({ ...context, declarations });
  return i;
}

/** Every block of declarations in `css`, each pushed when its closing brace is read, so a nested block comes before its parent's own declarations. */
export function parseCss(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const uncommented = css.replace(COMMENT, " ");
  for (let i = 0; i < uncommented.length; i++)
    i = readBlock(uncommented, i, { selector: null, atRules: [] }, rules);
  return rules;
}
