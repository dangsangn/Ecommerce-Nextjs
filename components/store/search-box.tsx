'use client'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  return (
    <form
      className="relative w-full"
      action={(formData) => {
        const q = String(formData.get('q') ?? '').trim()
        router.push(q ? `/?q=${encodeURIComponent(q)}` : '/')
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        name="q"
        type="search"
        placeholder="What are you looking for today?"
        defaultValue={defaultValue}
        aria-label="Search products"
        className="h-10 w-full rounded-xl border-0 bg-white pl-9 pr-3 text-sm text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-white/60"
      />
    </form>
  )
}
