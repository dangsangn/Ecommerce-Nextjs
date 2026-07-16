import Link from 'next/link'
import { CreateDiscountForm } from '@/components/discounts/create-discount-form'

export default function NewDiscountPage() {
  return (
    <div className="space-y-6">
      <Link href="/seller/discounts" className="text-sm text-primary hover:underline">← Back to discounts</Link>
      <h1 className="text-2xl font-semibold">New discount</h1>
      <CreateDiscountForm />
    </div>
  )
}
