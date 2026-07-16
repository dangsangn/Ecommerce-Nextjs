'use client'
import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createCommentAction } from '@/actions/comment.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Textarea } from '@/components/ui/textarea'

export function CommentForm({
  productId,
  parentId,
  replyToUserId,
  onDone,
}: {
  productId: string
  parentId?: string
  replyToUserId?: string
  onDone?: () => void
}) {
  const [state, formAction] = useActionState(createCommentAction, initialActionState)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message)
      ref.current?.reset()
      onDone?.()
    } else if (!state.ok && state.message) {
      toast.error(state.message)
    }
  }, [state, onDone])

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {replyToUserId ? <input type="hidden" name="replyToUserId" value={replyToUserId} /> : null}
      <Textarea name="content" placeholder={parentId ? 'Write a reply…' : 'Write a comment…'} required />
      <SubmitButton>{parentId ? 'Reply' : 'Post comment'}</SubmitButton>
    </form>
  )
}
