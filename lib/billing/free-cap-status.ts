import { FREE_CAP, freeClassificationsRemaining, isClassificationPaused } from "@/shared/free-cap";
import type { Plan } from "@/shared/types";

/**
 * Display shape for the Free-cap state (ADR-0002, Phase G). A Free Household may classify the first
 * {@link FREE_CAP} transactions; reaching the cap pauses AI classification only — Uploads, the
 * dashboard, Overrides and net tracking stay usable. Premium is uncapped here.
 */
export interface FreeCapStatus {
  plan: Plan;
  /** Premium: AI classification is never capped here. */
  unlimited: boolean;
  /** The Free cap. */
  cap: number;
  /** Classifications used (clamped to the cap on Free, for the "x of cap" readout). */
  used: number;
  /** Remaining classifications before AI pauses; `Infinity` on Premium. */
  remaining: number;
  /** Whether AI classification is currently paused (a Free Household at its cap). */
  paused: boolean;
}

/** Derive the {@link FreeCapStatus} from a Household's plan and its lifetime classified count. */
export function freeCapStatus({
  plan,
  classifiedCount,
}: {
  plan: Plan;
  classifiedCount: number;
}): FreeCapStatus {
  const unlimited = plan === "Premium";
  // Mirror free-cap's fail-safe: an invalid count reads as zero used (it never grants extra runway).
  const safeCount = Number.isFinite(classifiedCount) && classifiedCount > 0 ? classifiedCount : 0;
  return {
    plan,
    unlimited,
    cap: FREE_CAP,
    used: unlimited ? safeCount : Math.min(safeCount, FREE_CAP),
    remaining: freeClassificationsRemaining(plan, classifiedCount),
    paused: isClassificationPaused(plan, classifiedCount),
  };
}
