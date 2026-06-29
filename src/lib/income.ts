import type { Source } from "../../shared/types.ts";

export type { Source } from "../../shared/types.ts";
export { DEFAULT_INCOME } from "../../shared/types.ts";

export const sumSources = (s: Source[]): number =>
  s.reduce((a, x) => a + (Number(x.amt) || 0), 0);

let _seq = 0;
/** Monotonic, session-stable id for an editable row — enough for React keys. */
export const uid = (): string => `src_${++_seq}`;

/** Ensure every source has a stable `id` (loaded/imported data may lack one). */
export const withIds = (rows: Source[]): Source[] =>
  rows.map((r) => (r.id ? r : { ...r, id: uid() }));
