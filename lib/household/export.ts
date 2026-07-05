import type {
  accountBalances,
  accounts,
  bankConnections,
  expenseTypeBudgets,
  merchantRules,
  overrides,
  savingsGoals,
  savingsIncomeSources,
  savingsOffcardCosts,
  savingsOneOffAdjustments,
  transactions,
  uploads,
} from "@/lib/db/schema";

type BankConnection = typeof bankConnections.$inferSelect;
/** A bank connection safe to hand to the user: the secret token ciphertext removed. */
export type ExportedBankConnection = Omit<BankConnection, "accessToken" | "refreshToken">;

/** Everything a household's data export gathers (the raw repo reads). */
export interface HouseholdExportInput {
  accounts: Array<typeof accounts.$inferSelect>;
  balances: Array<typeof accountBalances.$inferSelect>;
  uploads: Array<typeof uploads.$inferSelect>;
  transactions: Array<typeof transactions.$inferSelect>;
  overrides: Array<typeof overrides.$inferSelect>;
  merchantRules: Array<typeof merchantRules.$inferSelect>;
  bankConnections: BankConnection[];
  savings: {
    goal: (typeof savingsGoals.$inferSelect) | undefined;
    incomeSources: Array<typeof savingsIncomeSources.$inferSelect>;
    offcardCosts: Array<typeof savingsOffcardCosts.$inferSelect>;
    oneOffAdjustments: Array<typeof savingsOneOffAdjustments.$inferSelect>;
  };
  budgets: Array<typeof expenseTypeBudgets.$inferSelect>;
}

/** The assembled, secret-scrubbed export payload (bank tokens removed). */
export type HouseholdExport = Omit<HouseholdExportInput, "bankConnections"> & {
  bankConnections: ExportedBankConnection[];
};

/**
 * Assemble a household's data export (#107, GDPR). Pure: it only reshapes the loaded rows — the
 * repo reads live in the route. The one non-trivial rule is a security invariant: the encrypted
 * aggregator `accessToken`/`refreshToken` on bank connections must NEVER leave the system, so they
 * are stripped here. Everything else passes through as-is.
 */
export function buildHouseholdExport(input: HouseholdExportInput): HouseholdExport {
  return {
    ...input,
    bankConnections: input.bankConnections.map((connection) => {
      // Shallow-copy then drop the secret ciphertext columns; never let them into the export.
      const safe: Partial<BankConnection> = { ...connection };
      delete safe.accessToken;
      delete safe.refreshToken;
      return safe as ExportedBankConnection;
    }),
  };
}
