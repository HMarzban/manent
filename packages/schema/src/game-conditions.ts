// Expression parser and flag evaluator for Game Script #set assignments and {condition} gates.

export type GameFlagValue = boolean | number | string;

export interface GameFlag {
  readonly name: string;
  readonly value: GameFlagValue;
  /** True when the flag comes from an unparsed custom condition expression toggled manually. */
  readonly manual: boolean;
}

export interface FlagEntry {
  readonly value: GameFlagValue;
  readonly manual: boolean;
}

export interface SetStatement {
  readonly name: string;
  readonly op: "=" | "+=" | "-=";
  readonly value: GameFlagValue;
}

export type CondExpr =
  | { readonly kind: "or"; readonly left: CondExpr; readonly right: CondExpr }
  | { readonly kind: "and"; readonly left: CondExpr; readonly right: CondExpr }
  | { readonly kind: "not"; readonly inner: CondExpr }
  | {
      readonly kind: "cmp";
      readonly name: string;
      readonly op: "==" | "!=" | ">=" | "<=" | ">" | "<";
      readonly value: GameFlagValue;
    }
  | { readonly kind: "var"; readonly name: string }
  | { readonly kind: "manual"; readonly raw: string };

const SET_PATTERN = /^#set\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=|=)\s*(.+)$/i;
const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUOTED_DOUBLE = new RegExp('^"(.*)"$');
const QUOTED_SINGLE = new RegExp("^'(.*)'$");
const CMP_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

export function parseLiteral(raw: string): GameFlagValue {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  const dbl = QUOTED_DOUBLE.exec(trimmed);
  if (dbl !== null) return dbl[1]!;
  const sgl = QUOTED_SINGLE.exec(trimmed);
  if (sgl !== null) return sgl[1]!;
  if (trimmed !== "") {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num === 0 ? 0 : num;
  }
  return trimmed;
}

export function parseSetStatement(text: string): SetStatement | null {
  const match = SET_PATTERN.exec(text.trim());
  if (match === null) return null;
  return {
    name: match[1]!,
    op: match[2] as "=" | "+=" | "-=",
    value: parseLiteral(match[3]!),
  };
}

function splitTopLevel(
  input: string,
  separators: readonly string[],
): { left: string; right: string } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    for (const sep of separators) {
      if (input.slice(i, i + sep.length).toLowerCase() === sep) {
        if (sep === "and" || sep === "or") {
          const prev = i > 0 ? input[i - 1]! : " ";
          const next = input[i + sep.length] ?? " ";
          if (/[A-Za-z0-9_]/.test(prev) || /[A-Za-z0-9_]/.test(next)) continue;
        }
        return {
          left: input.slice(0, i).trim(),
          right: input.slice(i + sep.length).trim(),
        };
      }
    }
  }
  return null;
}

function unwrapParens(input: string): string {
  let text = input.trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") {
        depth--;
        if (depth === 0 && i < text.length - 1) {
          wrapsWhole = false;
          break;
        }
      }
    }
    if (!wrapsWhole) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function parseConditionExpr(raw: string): CondExpr {
  const text = unwrapParens(raw);
  if (text === "") return { kind: "manual", raw: raw.trim() };

  const orSplit = splitTopLevel(text, ["||", "or"]);
  if (orSplit !== null && orSplit.left !== "" && orSplit.right !== "") {
    const left = parseConditionExpr(orSplit.left);
    const right = parseConditionExpr(orSplit.right);
    if (left.kind !== "manual" && right.kind !== "manual") {
      return { kind: "or", left, right };
    }
    return { kind: "manual", raw: raw.trim() };
  }

  const andSplit = splitTopLevel(text, ["&&", "and"]);
  if (andSplit !== null && andSplit.left !== "" && andSplit.right !== "") {
    const left = parseConditionExpr(andSplit.left);
    const right = parseConditionExpr(andSplit.right);
    if (left.kind !== "manual" && right.kind !== "manual") {
      return { kind: "and", left, right };
    }
    return { kind: "manual", raw: raw.trim() };
  }

  if (text.startsWith("!")) {
    const inner = parseConditionExpr(text.slice(1));
    return inner.kind === "manual"
      ? { kind: "manual", raw: raw.trim() }
      : { kind: "not", inner };
  }
  if (/^not\s+/i.test(text)) {
    const inner = parseConditionExpr(text.replace(/^not\s+/i, ""));
    return inner.kind === "manual"
      ? { kind: "manual", raw: raw.trim() }
      : { kind: "not", inner };
  }

  const cmp = CMP_PATTERN.exec(text);
  if (cmp !== null) {
    return {
      kind: "cmp",
      name: cmp[1]!,
      op: cmp[2] as "==" | "!=" | ">=" | "<=" | ">" | "<",
      value: parseLiteral(cmp[3]!),
    };
  }

  if (IDENT_PATTERN.test(text)) {
    return { kind: "var", name: text };
  }

  return { kind: "manual", raw: raw.trim() };
}

export function defaultFor(value: GameFlagValue): GameFlagValue {
  if (typeof value === "number") return 0;
  if (typeof value === "string") return "";
  return false;
}

export function registerFlag(
  map: Map<string, FlagEntry>,
  name: string,
  initial: GameFlagValue,
  manual: boolean,
): void {
  const existing = map.get(name);
  if (existing === undefined) {
    map.set(name, { value: initial, manual });
    return;
  }
  if (
    !existing.manual &&
    typeof existing.value === "boolean" &&
    typeof initial !== "boolean"
  ) {
    map.set(name, { value: initial, manual: false });
  }
}

export function collectExprFlags(
  expr: CondExpr,
  map: Map<string, FlagEntry>,
): void {
  switch (expr.kind) {
    case "or":
    case "and":
      collectExprFlags(expr.left, map);
      collectExprFlags(expr.right, map);
      return;
    case "not":
      collectExprFlags(expr.inner, map);
      return;
    case "cmp":
      registerFlag(map, expr.name, defaultFor(expr.value), false);
      return;
    case "var":
      registerFlag(map, expr.name, false, false);
      return;
    case "manual":
      registerFlag(map, expr.raw, false, true);
      return;
  }
}

function isTruthy(value: GameFlagValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value !== "";
}

export function evaluateCondition(
  expr: CondExpr,
  flags: ReadonlyMap<string, FlagEntry>,
): boolean {
  switch (expr.kind) {
    case "or":
      return (
        evaluateCondition(expr.left, flags) ||
        evaluateCondition(expr.right, flags)
      );
    case "and":
      return (
        evaluateCondition(expr.left, flags) &&
        evaluateCondition(expr.right, flags)
      );
    case "not":
      return !evaluateCondition(expr.inner, flags);
    case "var":
      return isTruthy(flags.get(expr.name)?.value);
    case "manual":
      return isTruthy(flags.get(expr.raw)?.value);
    case "cmp": {
      const actual = flags.get(expr.name)?.value ?? defaultFor(expr.value);
      const target = expr.value;
      if (typeof actual === "number" && typeof target === "number") {
        if (expr.op === "==") return actual === target;
        if (expr.op === "!=") return actual !== target;
        if (expr.op === ">=") return actual >= target;
        if (expr.op === "<=") return actual <= target;
        if (expr.op === ">") return actual > target;
        return actual < target;
      }
      const left = String(actual).toLowerCase();
      const right = String(target).toLowerCase();
      if (expr.op === "==") return left === right;
      if (expr.op === "!=") return left !== right;
      const numLeft = Number(actual);
      const numRight = Number(target);
      if (Number.isFinite(numLeft) && Number.isFinite(numRight)) {
        if (expr.op === ">=") return numLeft >= numRight;
        if (expr.op === "<=") return numLeft <= numRight;
        if (expr.op === ">") return numLeft > numRight;
        return numLeft < numRight;
      }
      return false;
    }
  }
}

export function applySetStatement(
  stmt: SetStatement,
  flags: Map<string, FlagEntry>,
): void {
  const existing = flags.get(stmt.name);
  if (stmt.op === "=") {
    flags.set(stmt.name, { value: stmt.value, manual: false });
    return;
  }
  const currentNum =
    typeof existing?.value === "number"
      ? existing.value
      : Number(existing?.value ?? 0);
  const delta =
    typeof stmt.value === "number" ? stmt.value : Number(stmt.value);
  const base = Number.isFinite(currentNum) ? currentNum : 0;
  const step = Number.isFinite(delta) ? delta : 0;
  const next = stmt.op === "+=" ? base + step : base - step;
  flags.set(stmt.name, { value: next === 0 ? 0 : next, manual: false });
}
