'use client'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SubmitButton({
  children,
  disabled,
  className,
}: {
  children: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className={cn('w-full', className)} disabled={pending || disabled}>
      {pending ? 'Processing…' : children}
    </Button>
  )
}
