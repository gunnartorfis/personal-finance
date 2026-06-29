import { describe, expect, it } from "vitest";

import {
  FREE_CAP,
  NOT_BUCKETED,
  canClassify,
  freeClassificationsRemaining,
  isClassificationPaused,
  isExpense,
} from "./free-cap.ts";

describe("expense-type model", () => {
  it("treats a negative charged amount as an expense", () => {
    expect(isExpense(-1990)).toBe(true);
  });

  it("treats a credit (zero or positive) as not an expense", () => {
    expect(isExpense(0)).toBe(false);
    expect(isExpense(1990)).toBe(false);
  });

  it("buckets credits and split payments as the empty Expense type", () => {
    expect(NOT_BUCKETED).toBe("");
  });
});

describe("free-cap counting", () => {
  it("caps a Free household at 50 distinct classified transactions", () => {
    expect(FREE_CAP).toBe(50);
  });

  it("reports classifications remaining for a Free household", () => {
    expect(freeClassificationsRemaining("Free", 0)).toBe(50);
    expect(freeClassificationsRemaining("Free", 49)).toBe(1);
    expect(freeClassificationsRemaining("Free", 50)).toBe(0);
    expect(freeClassificationsRemaining("Free", 60)).toBe(0); // never negative
  });

  it("leaves a Premium household uncapped", () => {
    expect(freeClassificationsRemaining("Premium", 10_000)).toBe(Infinity);
  });

  it("pauses classification for a Free household only once the cap is reached", () => {
    expect(isClassificationPaused("Free", 49)).toBe(false);
    expect(isClassificationPaused("Free", 50)).toBe(true);
    expect(isClassificationPaused("Premium", 10_000)).toBe(false);
  });

  it("allows classifying while under the cap", () => {
    expect(canClassify("Free", 49)).toBe(true);
    expect(canClassify("Free", 50)).toBe(false);
    expect(canClassify("Premium", 10_000)).toBe(true);
  });
});
