'use client'
import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { deleteCommentAction } from '@/actions/comment.actions'
import { initialActionState } from '@/actions/state'
import { groupComments } from '@/lib/comments/group'
import { CommentForm } from '@/components/store/comment-form'
import { Button } from '@/components/ui/button'
import type { Comment } from '@/types/comment'

function authorLabel(userId: string): string {
  return `Customer ••${userId.slice(-4)}`
}

function formatDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function DeleteButton({ commentId, productId }: { commentId: string; productId: string }) {
  const [state, formAction] = useActionState(deleteCommentAction, initialActionState)
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="productId" value={productId} />
      <Button type="submit" variant="ghost" size="xs">Delete</Button>
    </form>
  )
}

function CommentItem({
  comment,
  productId,
  currentUserId,
  isReply,
}: {
  comment: Comment
  productId: string
  currentUserId?: string
  isReply?: boolean
}) {
  return (
    <div className={isReply ? 'border-l pl-4' : ''}>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{authorLabel(comment.userId)}</span>
        <span className="text-muted-foreground">{formatDate(comment.createdAt)}</span>
        {comment.userId === currentUserId ? (
          <DeleteButton commentId={comment.id} productId={productId} />
        ) : null}
      </div>
      <p className="text-sm">{comment.content}</p>
    </div>
  )
}

export function CommentSection({
  productId,
  comments,
  currentUserId,
}: {
  productId: string
  comments: Comment[]
  currentUserId?: string
}) {
  const { topLevel, repliesByParent } = groupComments(comments)
  const [replyOpen, setReplyOpen] = useState<string | null>(null)

  return (
    <section className="space-y-6 border-t pt-8">
      <h2 className="text-xl font-semibold">Comments</h2>
      <CommentForm productId={productId} />

      {topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
      ) : (
        <ul className="space-y-6">
          {topLevel.map((c) => (
            <li key={c.id} className="space-y-3">
              <CommentItem comment={c} productId={productId} currentUserId={currentUserId} />
              <div className="pl-4">
                <Button variant="ghost" size="xs" onClick={() => setReplyOpen(replyOpen === c.id ? null : c.id)}>
                  {replyOpen === c.id ? 'Cancel' : 'Reply'}
                </Button>
                {replyOpen === c.id ? (
                  <div className="mt-2">
                    <CommentForm
                      productId={productId}
                      parentId={c.id}
                      replyToUserId={c.userId}
                      onDone={() => setReplyOpen(null)}
                    />
                  </div>
                ) : null}
              </div>
              {(repliesByParent[c.id] ?? []).map((r) => (
                <CommentItem key={r.id} comment={r} productId={productId} currentUserId={currentUserId} isReply />
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
