import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-surface">
      <header className="bg-brand shadow-md">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <Link href="/" className="text-2xl font-extrabold tracking-tight text-white">SHOP</Link>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
