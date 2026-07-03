import { SpendShareList } from "@/components/spend-share-list"
import type { MerchantSpend } from "@/lib/dashboard/top-merchants"

/**
 * The top-merchants module (Phase K, K13): where the money actually goes over the trailing window.
 * Ranks merchants by spend with a share-of-spend meter, via the shared {@link SpendShareList}.
 * Renders nothing when there's no spend to show.
 */
export function TopMerchants({
  merchants,
  currency,
  className,
}: {
  merchants: MerchantSpend[]
  currency: string
  className?: string
}) {
  return (
    <SpendShareList
      heading="Top merchants"
      items={merchants.map((merchant) => ({
        key: merchant.merchant,
        label: merchant.merchant,
        spending: merchant.spending,
        share: merchant.share,
      }))}
      currency={currency}
      className={className}
    />
  )
}
