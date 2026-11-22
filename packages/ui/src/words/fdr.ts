/** The answer to a Final Draft 7 file, in a module of its own so the first load holds no other import words. */
export const FDR_NOT_READABLE = (name: string): string =>
  `Couldn't open '${name}': it was saved by Final Draft 7 or earlier. Open it in Final Draft 8 or later, save it as an .fdx file, then import that.`;
