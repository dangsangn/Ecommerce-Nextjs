'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { upgradeToShopAction } from '@/actions/user.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const STEPS = [
  'Create your shop',
  'Add your first product',
  'Set up discount codes',
]

export function UpgradeShopForm({ isShop }: { isShop: boolean }) {
  const [state, formAction] = useActionState(upgradeToShopAction, initialActionState)

  // On success the action redirects to /seller?welcome=1 (which toasts there),
  // so only the error path surfaces a message here.
  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isShop ? 'Shop' : 'Become a seller'}</CardTitle>
        <CardDescription>
          {isShop ? 'Your shop is active.' : 'A few steps to start selling on SHOP.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isShop ? (
          <p className="text-sm text-muted-foreground">
            You can manage products and discounts from the seller dashboard.
          </p>
        ) : (
          <div className="space-y-6">
            <ol className="space-y-2">
              {STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  <span className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="shopName">Shop name (optional)</Label>
                <Input id="shopName" name="shopName" placeholder="Defaults to your name" />
              </div>
              <SubmitButton>Create shop</SubmitButton>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
