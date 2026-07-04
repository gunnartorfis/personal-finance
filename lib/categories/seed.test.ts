import * as lucide from "lucide-react";
import { describe, expect, it } from "vitest";

import { TYPES } from "@/shared/types";

import { CATEGORY_SEED, CATEGORY_SEED_LEAVES } from "./seed";

/** Lucide exports PascalCase components; convert a kebab icon name to that form. */
const toPascal = (kebab: string) =>
  kebab
    .split("-")
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");

const ALL_SLUGS = [
  ...CATEGORY_SEED.map((g) => g.slug),
  ...CATEGORY_SEED_LEAVES.map((l) => l.slug),
];

describe("CATEGORY_SEED (ADR-0020)", () => {
  it("has 11 groups and 58 leaf subcategories", () => {
    expect(CATEGORY_SEED).toHaveLength(11);
    expect(CATEGORY_SEED_LEAVES).toHaveLength(58);
  });

  it("gives every group at least one leaf", () => {
    for (const group of CATEGORY_SEED) {
      expect(group.children.length, group.slug).toBeGreaterThan(0);
    }
  });

  it("uses globally-unique slugs across groups and leaves", () => {
    expect(new Set(ALL_SLUGS).size).toBe(ALL_SLUGS.length);
  });

  it("keys every label off its slug (i18n message key), non-empty", () => {
    for (const group of CATEGORY_SEED) {
      expect(group.labelKey).toBe(group.slug);
      expect(group.labelKey.length).toBeGreaterThan(0);
    }
    for (const leaf of CATEGORY_SEED_LEAVES) {
      expect(leaf.labelKey).toBe(leaf.slug);
      expect(leaf.labelKey.length).toBeGreaterThan(0);
    }
  });

  it("gives every leaf a valid discretionary default Expense type", () => {
    for (const leaf of CATEGORY_SEED_LEAVES) {
      expect(TYPES, leaf.slug).toContain(leaf.defaultExpenseType);
    }
  });

  it("only references Lucide icons that exist in the installed lucide-react", () => {
    const icons = [...CATEGORY_SEED.map((g) => g.icon), ...CATEGORY_SEED_LEAVES.map((l) => l.icon)];
    for (const icon of icons) {
      expect(icon.length, "icon name empty").toBeGreaterThan(0);
      expect(lucide, icon).toHaveProperty(toPascal(icon));
    }
  });

  it("uses slug-safe identifiers (lowercase kebab-case)", () => {
    for (const slug of ALL_SLUGS) {
      expect(slug, slug).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
