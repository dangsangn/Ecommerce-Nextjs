'use client'
import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createDiscountAction } from '@/actions/discount.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AppliesTo, DiscountType } from '@/types/discount'

export function CreateDiscountForm() {
  const [state, formAction] = useActionState(createDiscountAction, initialActionState)
  const [type, setType] = useState<DiscountType>('fixed_amount')
  const [appliesTo, setAppliesTo] = useState<AppliesTo>('all')

  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New discount</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="discount_name">Name</Label>
            <Input id="discount_name" name="discount_name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount_description">Description</Label>
            <Textarea id="discount_description" name="discount_description" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount_code">Code</Label>
            <Input id="discount_code" name="discount_code" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select name="discount_type" value={type} onValueChange={(v) => setType(v as DiscountType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_amount">Fixed amount</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount_value">Value</Label>
              <Input id="discount_value" name="discount_value" type="number" step="0.01" min="0" required />
              <p className="text-xs text-muted-foreground">
                {type === 'percentage' ? '0–100 (percent)' : 'Amount off'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="discount_start_date">Start date</Label>
              <Input id="discount_start_date" name="discount_start_date" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount_end_date">End date</Label>
              <Input id="discount_end_date" name="discount_end_date" type="date" required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="discount_max_uses">Max uses (optional)</Label>
              <Input id="discount_max_uses" name="discount_max_uses" type="number" min="1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount_max_uses_per_user">Per user (optional)</Label>
              <Input id="discount_max_uses_per_user" name="discount_max_uses_per_user" type="number" min="1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount_min_order_value">Min order (optional)</Label>
              <Input id="discount_min_order_value" name="discount_min_order_value" type="number" min="0" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Applies to</Label>
            <Select name="discount_applies_to" value={appliesTo} onValueChange={(v) => setAppliesTo(v as AppliesTo)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="specific_products">Specific products</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {appliesTo === 'specific_products' ? (
            <div className="space-y-2">
              <Label htmlFor="discount_product_ids">Product IDs</Label>
              <Input id="discount_product_ids" name="discount_product_ids" placeholder="id1, id2, id3" />
              <p className="text-xs text-muted-foreground">Comma-separated product IDs.</p>
            </div>
          ) : null}

          <SubmitButton>Create discount</SubmitButton>
        </form>
      </CardContent>
    </Card>
  )
}
