import { z } from 'zod'

export const upgradeShopSchema = z.object({
  shopName: z.string().trim().max(100, 'Shop name is too long').optional(),
})

export type UpgradeShopInput = z.infer<typeof upgradeShopSchema>
