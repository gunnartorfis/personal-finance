import type { RealType } from "../../shared/types.ts";

export const TYPE_COLOR: Record<RealType, string> = {
  Fixed: "var(--fixed)",
  Necessary: "var(--nec)",
  "Nice to have": "var(--nice)",
};

export const TYPE_CLASS: Record<RealType, string> = {
  Fixed: "fixed",
  Necessary: "nec",
  "Nice to have": "nice",
};

/** confidence -> badge class */
export function confClass(c: number): string {
  return c >= 0.85 ? "hi" : c >= 0.6 ? "med" : "lo";
}
