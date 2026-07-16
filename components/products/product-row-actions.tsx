'use client'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { toast } from 'sonner'
import { publishProductAction, unpublishProductAction } from '@/actions/product.actions'
import { initialActionState } from '@/actions/state'
import { Button, buttonVariants } from '@/components/ui/button'

function ToggleButton({ published }: { published: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? 'Processing…' : published ? 'Unpublish' : 'Publish'}
    </Button>
  )
}

export function ProductRowActions({ id, published }: { id: string; published: boolean }) {
  const action = published ? unpublishProductAction : publishProductAction
  const [state, formAction] = useActionState(action, initialActionState)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <div className="flex items-center justify-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <ToggleButton published={published} />
      </form>
      <Link href={`/seller/products/${id}/edit`} className={buttonVariants({ variant: 'outline' })}>
        Edit
      </Link>
    </div>
  )
}
