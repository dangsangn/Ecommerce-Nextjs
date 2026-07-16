'use client'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'

export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  return (
    <form
      className="w-full max-w-sm"
      action={(formData) => {
        const q = String(formData.get('q') ?? '').trim()
        router.push(q ? `/?q=${encodeURIComponent(q)}` : '/')
      }}
    >
      <Input name="q" type="search" placeholder="Search products…" defaultValue={defaultValue} aria-label="Search products" />
    </form>
  )
}
