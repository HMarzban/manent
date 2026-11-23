export function useCellPresence(
  _docId: string,
): (rowId: string, columnId: string) => readonly string[] {
  return () => [];
}
