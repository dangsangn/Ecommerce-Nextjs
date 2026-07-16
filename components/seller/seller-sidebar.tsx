'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isNavItemActive } from '@/components/seller/nav-items'

export function SellerSidebar() {
  const pathname = usePathname()
  return (
    <div className="flex h-full w-full flex-col gap-6 px-3 py-6">
      <div className="px-3">
        <Link href="/seller" className="text-lg font-semibold">SHOP</Link>
        <p className="text-xs text-muted-foreground">Seller Centre</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item.href, pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <Link
        href="/"
        className="flex items-center gap-1 px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to store
      </Link>
    </div>
  )
}
