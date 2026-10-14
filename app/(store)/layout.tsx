import { Headphones, RotateCcw, ShieldCheck, Truck } from 'lucide-react'
import { StoreHeader } from '@/components/store/store-header'

const PERKS = [
  { icon: ShieldCheck, title: 'Genuine products', text: 'Sold by verified shops' },
  { icon: Truck, title: 'Fast delivery', text: 'Tracked from shop to door' },
  { icon: RotateCcw, title: 'Easy returns', text: 'Cancel while an order is pending' },
  { icon: Headphones, title: 'Friendly support', text: 'We are here to help' },
]

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface">
      <StoreHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="mt-8 bg-card">
        <div>
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 md:grid-cols-4">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t py-4 text-center text-xs text-muted-foreground">© Shop</div>
      </footer>
    </div>
  )
}
