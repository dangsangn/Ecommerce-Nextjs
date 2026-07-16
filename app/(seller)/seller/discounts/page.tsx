import Link from 'next/link'
import { apiFetch } from '@/lib/api/server-client'
import { getAccessPayload } from '@/lib/auth/session'
import { buttonVariants } from '@/components/ui/button'
import { DiscountList } from '@/components/discounts/discount-list'
import { DiscountCodeLookup } from '@/components/discounts/discount-code-lookup'
import type { Discount } from '@/types/discount'

export default async function DiscountsPage() {
  const payload = await getAccessPayload()
  let discounts: Discount[] = []
  let error: string | null = null
  try {
    discounts = await apiFetch<Discount[]>(`/discount/shop/${payload?.userId ?? ''}`, { auth: true })
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not load discounts'
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Discounts</h1>
        <Link href="/seller/discounts/new" className={buttonVariants()}>New discount</Link>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : <DiscountList discounts={discounts} />}
      <DiscountCodeLookup />
    </div>
  )
}
