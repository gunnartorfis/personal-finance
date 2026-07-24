/**
 * Intent-level Activity log action constants (ADR-0017), stored in `activity_log.action`. Recorded
 * explicitly by the route/domain layer that knows the intent — never auto-derived from table
 * writes. Grouped by domain; the member-facing UI (later slice) maps each to a localized label.
 */
export const ActivityAction = {
  // Transactions (ADR-0009/0011/0014).
  TransactionExcluded: "transaction.excluded",
  TransactionIncluded: "transaction.included",
  TransactionIncomeMarked: "transaction.income_marked",
  TransactionIncomeUnmarked: "transaction.income_unmarked",
  TransactionRetyped: "transaction.retyped",
  TransactionRetypeCleared: "transaction.retype_cleared",
  TransactionRecategorized: "transaction.recategorized",
  TransactionShareSet: "transaction.share_set",
  TransactionShareCleared: "transaction.share_cleared",
  // Per-row soft-delete (ADR-0026): a Member deleted a single manually-owned Transaction, or
  // restored one. Retained + reversible, distinct from the whole-Upload undo below.
  TransactionDeleted: "transaction.deleted",
  TransactionRestored: "transaction.restored",
  // A Member hand-entered a Transaction (ADR-0026): a first-class `manual`-source row.
  TransactionCreated: "transaction.created",

  // Accounts & balances (ADR-0004/0016).
  AccountCreated: "account.created",
  AccountBalanceRecorded: "account.balance_recorded",

  // Merchant rules (Phase F).
  MerchantRuleCreated: "rule.created",
  MerchantRuleDeleted: "rule.deleted",

  // Invites & membership (ADR-0010). Note: invite decline is an external, non-member action and is
  // deliberately not logged; household deletion cascades the log away, so it is not logged either.
  InviteCreated: "invite.created",
  InviteRevoked: "invite.revoked",
  InviteAccepted: "invite.accepted",
  MemberLeft: "member.left",

  // Savings & budgets config (ADR-0007, #103). The forms save the whole set at once.
  SavingsConfigUpdated: "savings.config_updated",
  SavingsGoalUpdated: "savings.goal_updated",
  BudgetsUpdated: "budgets.updated",

  // Billing, data export, bank connections. Only member-initiated MUTATIONS are logged: the
  // subscription downgrade, the export download, and a bank disconnect. Checkout-start and
  // connect-start open external (Straumur / SCA) flows and don't mutate household data; their
  // completions land in the webhook/callback, which ADR-0017 excludes as system/external.
  BillingCancelled: "billing.cancelled",
  DataExported: "data.exported",
  BankDisconnected: "bank.disconnected",

  // Household data reset (ADR-0017) — logged inside the reset transaction; the log itself survives.
  DataReset: "data.reset",

  // Import recovery (ADR-0025): a Member recovered a row the CSV parser couldn't read, or forced a
  // duplicate in — the latter deliberately overriding the ADR-0003 dedup guard.
  UploadRowsRecovered: "upload.rows_recovered",
  UploadRowsForced: "upload.rows_forced",

  // Upload undo (ADR-0024): a Member undid an Upload, archiving all of its Transactions (reversible).
  UploadUndone: "upload.undone",
  // Upload restore (ADR-0024): a Member restored an undone Upload, un-archiving its Transactions.
  UploadRestored: "upload.restored",
} as const;

export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];
