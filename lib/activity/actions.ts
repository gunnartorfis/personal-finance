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
  TransactionShareSet: "transaction.share_set",
  TransactionShareCleared: "transaction.share_cleared",

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
} as const;

export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];
