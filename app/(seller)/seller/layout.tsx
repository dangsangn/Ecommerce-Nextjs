import { SellerSidebar } from '@/components/seller/seller-sidebar'
import { SellerMobileNav } from '@/components/seller/seller-mobile-nav'

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SellerSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <SellerMobileNav />
        <main className="flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
  )
}
