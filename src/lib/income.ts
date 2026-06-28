import type { Source } from "../../shared/types.ts";

export type { Source } from "../../shared/types.ts";
export { DEFAULT_INCOME } from "../../shared/types.ts";

export const sumSources = (s: Source[]): number =>
  s.reduce((a, x) => a + (Number(x.amt) || 0), 0);
