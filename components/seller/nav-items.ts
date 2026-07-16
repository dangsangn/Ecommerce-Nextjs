import { LayoutDashboard, Package, Tag, User, type LucideIcon } from 'lucide-react'

export interface SellerNavItem {
  label: string
  href: string
  icon: LucideIcon
}

// Single source of truth for the seller navigation, shared by the desktop
// sidebar and the mobile drawer. Add new sections here (e.g. Orders) once the
// backend supports them.
export const NAV_ITEMS: SellerNavItem[] = [
  { label: 'Dashboard', href: '/seller', icon: LayoutDashboard },
  { label: 'Products', href: '/seller/products', icon: Package },
  { label: 'Discounts', href: '/seller/discounts', icon: Tag },
  { label: 'Account', href: '/seller/account', icon: User },
]

// `/seller` is a prefix of every seller route, so it must match exactly;
// every other item matches its route and any nested child routes.
export function isNavItemActive(href: string, pathname: string): boolean {
  return href === '/seller'
    ? pathname === '/seller'
    : pathname === href || pathname.startsWith(`${href}/`)
}
