import { Suspense } from 'react'
import Link from 'next/link'
import { Package, Tag, User } from 'lucide-react'
import { getAccessPayload } from '@/lib/auth/session'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { WelcomeToast } from '@/components/seller/welcome-toast'

const QUICK_ACTIONS = [
  {
    title: 'Products',
    description: 'Add, edit, and publish the items in your shop.',
    href: '/seller/products',
    cta: 'Manage products',
    icon: Package,
  },
  {
    title: 'Discounts',
    description: 'Create discount codes to promote your shop.',
    href: '/seller/discounts',
    cta: 'Manage discounts',
    icon: Tag,
  },
  {
    title: 'Account',
    description: 'Update your profile and shop details.',
    href: '/seller/account',
    cta: 'View account',
    icon: User,
  },
]

export default async function SellerHomePage() {
  const payload = await getAccessPayload()
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <WelcomeToast />
      </Suspense>
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{payload?.email ?? '—'}</span>
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {QUICK_ACTIONS.map((action) => (
          <Card key={action.href}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <action.icon className="size-4 text-muted-foreground" />
                {action.title}
              </CardTitle>
              <CardDescription>{action.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={action.href}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {action.cta}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
