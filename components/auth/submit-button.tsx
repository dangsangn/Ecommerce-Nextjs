'use client'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

export function SubmitButton({
  children,
  disabled,
}: {
  children: React.ReactNode
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
