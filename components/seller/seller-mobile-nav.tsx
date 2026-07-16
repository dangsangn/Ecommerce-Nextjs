'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isNavItemActive } from '@/components/seller/nav-items'

export function SellerMobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div className="md:hidden">
      <div className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/seller" className="text-base font-semibold">
          SHOP <span className="font-normal text-muted-foreground">Seller Centre</span>
        </Link>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col gap-6 bg-sidebar px-3 py-6 shadow-lg">
            <div className="flex items-center justify-between px-3">
              <div>
                <span className="text-lg font-semibold">SHOP</span>
                <p className="text-xs text-muted-foreground">Seller Centre</p>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isNavItemActive(item.href, pathname)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              Back to store
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
