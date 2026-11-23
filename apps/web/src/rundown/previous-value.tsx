export function useCornerMark(
  _docId: string,
): (rowId: string, columnId: string) => boolean {
  return () => false;
}
