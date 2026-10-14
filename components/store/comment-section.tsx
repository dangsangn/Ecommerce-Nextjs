'use client'
import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { deleteCommentAction } from '@/actions/comment.actions'
import { initialActionState } from '@/actions/state'
import { groupComments } from '@/lib/comments/group'
import { CommentForm } from '@/components/store/comment-form'
import { Button } from '@/components/ui/button'
import type { Comment } from '@/types/comment'

function authorLabel(comment: Comment): string {
  return comment.user?.name ?? `Customer ••${comment.userId.slice(-4)}`
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
  const replyToName =
    comment.replyToUser?.name ??
    (comment.replyToUserId ? `Customer ••${comment.replyToUserId.slice(-4)}` : null)

  return (
    <div className={isReply ? 'ml-4 rounded-xl bg-muted/60 p-3' : ''}>
      <div className="flex items-center gap-2 text-sm">
        <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-xs font-bold uppercase text-brand">
          {authorLabel(comment).charAt(0)}
        </span>
        <span className="font-semibold">{authorLabel(comment)}</span>
        <span className="text-muted-foreground">{formatDate(comment.createdAt)}</span>
        {comment.userId === currentUserId ? (
          <DeleteButton commentId={comment.id} productId={productId} />
        ) : null}
      </div>
      <p className="mt-1 pl-9 text-sm">
        {isReply && replyToName ? (
          <span className="mr-1 font-medium text-primary">@{replyToName}</span>
        ) : null}
        {comment.content}
      </p>
    </div>
  )
}

// Nút Reply cho bất kỳ comment nào (gốc hoặc con).
// Kiểu YouTube 2 tầng: reply luôn treo phẳng dưới comment GỐC (rootId),
// còn replyToUserId là tác giả của chính comment vừa bấm để hiển thị "@tên".
function ReplyControl({
  productId,
  rootId,
  target,
  isOpen,
  onToggle,
  onDone,
}: {
  productId: string
  rootId: string
  target: Comment
  isOpen: boolean
  onToggle: () => void
  onDone: () => void
}) {
  return (
    <div className="pl-4">
      <Button variant="ghost" size="xs" onClick={onToggle}>
        {isOpen ? 'Cancel' : 'Reply'}
      </Button>
      {isOpen ? (
        <div className="mt-2">
          <CommentForm
            productId={productId}
            parentId={rootId}
            replyToUserId={target.userId}
            onDone={onDone}
          />
        </div>
      ) : null}
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

  const toggle = (id: string) => setReplyOpen((cur) => (cur === id ? null : id))
  const close = () => setReplyOpen(null)

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-bold">Questions &amp; comments</h2>
      <CommentForm productId={productId} />

      {topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
      ) : (
        <ul className="space-y-6">
          {topLevel.map((c) => (
            <li key={c.id} className="space-y-3 border-b pb-5 last:border-0 last:pb-0">
              <CommentItem comment={c} productId={productId} currentUserId={currentUserId} />
              <ReplyControl
                productId={productId}
                rootId={c.id}
                target={c}
                isOpen={replyOpen === c.id}
                onToggle={() => toggle(c.id)}
                onDone={close}
              />
              {(repliesByParent[c.id] ?? []).map((r) => (
                <div key={r.id} className="space-y-2">
                  <CommentItem comment={r} productId={productId} currentUserId={currentUserId} isReply />
                  {/* Reply vào comment con vẫn treo phẳng dưới gốc c.id, chỉ @tên tác giả của r */}
                  <div className="pl-4">
                    <ReplyControl
                      productId={productId}
                      rootId={c.id}
                      target={r}
                      isOpen={replyOpen === r.id}
                      onToggle={() => toggle(r.id)}
                      onDone={close}
                    />
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
