import type { Comment } from '@/types/comment'

export function groupComments(list: Comment[]): {
  topLevel: Comment[]
  repliesByParent: Record<string, Comment[]>
} {
  const topLevel: Comment[] = []
  const repliesByParent: Record<string, Comment[]> = {}
  for (const c of list) {
    if (c.parentId == null) {
      topLevel.push(c)
    } else {
      ;(repliesByParent[c.parentId] ??= []).push(c)
    }
  }
  return { topLevel, repliesByParent }
}
