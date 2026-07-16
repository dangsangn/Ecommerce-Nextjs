import { getAccessPayload } from '@/lib/auth/session'
import { AvatarForm } from '@/components/account/avatar-form'
import { UpgradeShopForm } from '@/components/account/upgrade-shop-form'

export default async function AccountPage() {
  const payload = await getAccessPayload()
  const isShop = Boolean(payload?.roles?.includes('shop'))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and shop.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <AvatarForm email={payload?.email} />
        <UpgradeShopForm isShop={isShop} />
      </div>
    </div>
  )
}
