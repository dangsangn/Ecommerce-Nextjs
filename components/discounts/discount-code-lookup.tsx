'use client'
import { useActionState } from 'react'
import { lookupDiscountByCodeAction } from '@/actions/discount.actions'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Discount } from '@/types/discount'

const initial: { ok: boolean; message?: string; data?: Discount } = { ok: false }

export function DiscountCodeLookup() {
  const [state, formAction] = useActionState(lookupDiscountByCodeAction, initial)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Look up a code</CardTitle>
        <CardDescription>Check whether a discount code is currently usable.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input id="code" name="code" required />
          </div>
          <div className="w-32">
            <SubmitButton>Look up</SubmitButton>
          </div>
        </form>
        {state.ok && state.data ? (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{state.data.discount_name}</p>
            <p className="text-muted-foreground">
              {state.data.discount_type === 'percentage'
                ? `${state.data.discount_value}% off`
                : `${state.data.discount_value} off`}
            </p>
          </div>
        ) : null}
        {!state.ok && state.message ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
