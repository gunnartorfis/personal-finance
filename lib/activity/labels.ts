import { ActivityAction } from "./actions";

/**
 * Map each Activity log action constant to its camelCase key in the `activityLog.actions` message
 * catalog (keys can't contain the `.` next-intl uses for nesting). Kept beside the constants so a
 * new action is a compile-time reminder to add its label to both catalogs (the i18n parity test
 * then enforces en/is coverage). Unknown actions fall back to a generic label rather than throwing,
 * so an entry written by newer code never breaks an older reader.
 */
const ACTION_LABEL_KEY: Record<string, string> = {
  [ActivityAction.TransactionExcluded]: "transactionExcluded",
  [ActivityAction.TransactionIncluded]: "transactionIncluded",
  [ActivityAction.TransactionIncomeMarked]: "transactionIncomeMarked",
  [ActivityAction.TransactionIncomeUnmarked]: "transactionIncomeUnmarked",
  [ActivityAction.TransactionRetyped]: "transactionRetyped",
  [ActivityAction.TransactionRetypeCleared]: "transactionRetypeCleared",
  [ActivityAction.TransactionRecategorized]: "transactionRecategorized",
  [ActivityAction.TransactionShareSet]: "transactionShareSet",
  [ActivityAction.TransactionShareCleared]: "transactionShareCleared",
  [ActivityAction.TransactionDeleted]: "transactionDeleted",
  [ActivityAction.TransactionRestored]: "transactionRestored",
  [ActivityAction.TransactionCreated]: "transactionCreated",
  [ActivityAction.AccountCreated]: "accountCreated",
  [ActivityAction.AccountBalanceRecorded]: "accountBalanceRecorded",
  [ActivityAction.MerchantRuleCreated]: "merchantRuleCreated",
  [ActivityAction.MerchantRuleDeleted]: "merchantRuleDeleted",
  [ActivityAction.InviteCreated]: "inviteCreated",
  [ActivityAction.InviteRevoked]: "inviteRevoked",
  [ActivityAction.InviteAccepted]: "inviteAccepted",
  [ActivityAction.MemberLeft]: "memberLeft",
  [ActivityAction.SavingsConfigUpdated]: "savingsConfigUpdated",
  [ActivityAction.SavingsGoalUpdated]: "savingsGoalUpdated",
  [ActivityAction.BudgetsUpdated]: "budgetsUpdated",
  [ActivityAction.BillingCancelled]: "billingCancelled",
  [ActivityAction.DataExported]: "dataExported",
  [ActivityAction.BankDisconnected]: "bankDisconnected",
  [ActivityAction.DataReset]: "dataReset",
  [ActivityAction.UploadRowsRecovered]: "uploadRowsRecovered",
  [ActivityAction.UploadRowsForced]: "uploadRowsForced",
  [ActivityAction.UploadUndone]: "uploadUndone",
  [ActivityAction.UploadRestored]: "uploadRestored",
};

/** The `activityLog.actions.*` catalog key for an action string; `"unknown"` if unrecognized. */
export function activityActionLabelKey(action: string): string {
  return ACTION_LABEL_KEY[action] ?? "unknown";
}
