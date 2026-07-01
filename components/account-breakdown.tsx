import { SpendShareList } from "@/components/spend-share-list"
import type { AccountSpend } from "@/lib/dashboard/account-breakdown"

/**
 * The account-breakdown module (Phase K, K15): how the period's spend splits across the household's
 * Accounts, via the shared {@link SpendShareList}. Only meaningful with more than one Account, so the
 * view-model passes `null` otherwise — this then renders nothing (as it also does with no spend).
 */
export function AccountBreakdown({
  accounts,
  currency,
  className,
}: {
  accounts: AccountSpend[] | null
  currency: string
  className?: string
}) {
  if (!accounts) return null

  return (
    <SpendShareList
      heading="Spending by account"
      items={accounts.map((account) => ({
        key: account.accountId,
        label: account.name,
        spending: account.spending,
        share: account.share,
      }))}
      currency={currency}
      className={className}
    />
  )
}
