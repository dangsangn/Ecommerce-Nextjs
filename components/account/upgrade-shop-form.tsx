'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { upgradeToShopAction } from '@/actions/user.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function UpgradeShopForm({ isShop }: { isShop: boolean }) {
  const [state, formAction] = useActionState(upgradeToShopAction, initialActionState)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shop</CardTitle>
        <CardDescription>
          {isShop ? 'Your shop is active.' : 'Become a shop to start selling.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isShop ? (
          <p className="text-sm text-muted-foreground">
            You can manage products and discounts from the seller dashboard.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shopName">Shop name (optional)</Label>
              <Input id="shopName" name="shopName" placeholder="Defaults to your name" />
            </div>
            <SubmitButton>Upgrade to shop</SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
