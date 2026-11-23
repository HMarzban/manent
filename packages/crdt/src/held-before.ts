// What the keys of the document's root maps held before a change, and where a type sits among the roots.
import * as Y from "yjs";

/** The type holding this one; null for a root. */
export function parentOf(type: unknown): unknown {
  return type instanceof Y.AbstractType && type.parent instanceof Y.AbstractType
    ? type.parent
    : null;
}

export function rootName(
  fragment: Y.XmlFragment,
  root: unknown,
): string | null {
  for (const [name, type] of fragment.doc?.share ?? [])
    if (type === root) return name;
  return null;
}

const isAdded = (tr: Y.Transaction, item: Y.Item): boolean =>
  item.id.clock >= (tr.beforeState.get(item.id.client) ?? 0);

/**
 * Keeps in `before`, by root map name then key, copied, the plain value that the key of `item`, an entry `tr` wrote
 * or deleted in a root map other than `fragment`, held when `tr` began, unless an earlier transaction already kept
 * one; undefined when it held nothing or a type.
 */
export function noteBefore(
  fragment: Y.XmlFragment,
  before: Map<string, Map<string, unknown>>,
  tr: Y.Transaction,
  item: Y.Item,
): void {
  const { parent, parentSub } = item;
  if (parentSub === null || parentOf(parent) !== null) return;
  const name = parent === fragment ? null : rootName(fragment, parent);
  if (name === null) return;
  const kept = before.get(name) ?? new Map<string, unknown>();
  before.set(name, kept);
  if (kept.has(parentSub)) return;
  // a key's entries are chained oldest first: it held the newest one the transaction did not write, if still there
  let held: Y.Item | null = item;
  for (let next = item.right; next !== null; next = next.right) held = next;
  while (held !== null && isAdded(tr, held)) held = held.left;
  const content =
    held === null || (held.deleted && !Y.isDeleted(tr.deleteSet, held.id))
      ? null
      : held.content;
  kept.set(
    parentSub,
    content instanceof Y.ContentAny || content instanceof Y.ContentJSON
      ? structuredClone(content.getContent().at(-1))
      : undefined,
  );
}
