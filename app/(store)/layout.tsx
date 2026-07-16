import { StoreHeader } from '@/components/store/store-header'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">© Shop</div>
      </footer>
    </div>
  )
}
