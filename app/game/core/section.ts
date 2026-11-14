export const SECTION = { a: 3.75, b: 2.95, ch: 1.20 } as const;

const { a, b, ch } = SECTION;
export const SECTION_OUTLINE = [
  [-a + ch, -b], [a - ch, -b], [a, -b + ch], [a, b - ch],
  [a - ch, b], [-a + ch, b], [-a, b - ch], [-a, -b + ch],
] as const;
