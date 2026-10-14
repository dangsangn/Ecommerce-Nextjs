import { getAccessPayload } from '@/lib/auth/session'
import { logoutAction } from '@/actions/auth.actions'
import { Button } from '@/components/ui/button'
import { AvatarForm } from '@/components/account/avatar-form'
import { UpgradeShopForm } from '@/components/account/upgrade-shop-form'

export default async function AccountPage() {
  const payload = await getAccessPayload()
  const isShop = Boolean(payload?.roles?.includes('shop'))

  // New sellers land here from "Start Selling" — give them a focused, guided
  // upgrade flow instead of burying the form in the account grid.
  if (!isShop) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Start selling on SHOP</h1>
          <p className="text-sm text-muted-foreground">
            Create your shop to start listing products and reaching buyers.
          </p>
        </div>
        <UpgradeShopForm isShop={isShop} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Account</h1>
          <p className="text-sm text-muted-foreground">Manage your profile and shop.</p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">Sign out</Button>
        </form>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <AvatarForm email={payload?.email} />
        <UpgradeShopForm isShop={isShop} />
      </div>
    </div>
  )
}
