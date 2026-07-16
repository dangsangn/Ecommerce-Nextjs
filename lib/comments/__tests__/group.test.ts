import { describe, it, expect } from 'vitest'
import { groupComments } from '@/lib/comments/group'
import type { Comment } from '@/types/comment'

const c = (over: Partial<Comment>): Comment => ({
  id: 'x', productId: 'p', userId: 'u', content: 'hi', parentId: null, replyToUserId: null, ...over,
})

describe('groupComments', () => {
  it('separates top-level from replies', () => {
    const { topLevel, repliesByParent } = groupComments([
      c({ id: 'a', parentId: null }),
      c({ id: 'b', parentId: 'a', replyToUserId: 'u' }),
      c({ id: 'd', parentId: null }),
    ])
    expect(topLevel.map((t) => t.id)).toEqual(['a', 'd'])
    expect(repliesByParent['a'].map((r) => r.id)).toEqual(['b'])
    expect(repliesByParent['d']).toBeUndefined()
  })
  it('groups multiple replies under the right parent', () => {
    const { repliesByParent } = groupComments([
      c({ id: 'a', parentId: null }),
      c({ id: 'b', parentId: 'a' }),
      c({ id: 'e', parentId: 'a' }),
    ])
    expect(repliesByParent['a'].map((r) => r.id)).toEqual(['b', 'e'])
  })
  it('returns empty groups for an empty list', () => {
    const { topLevel, repliesByParent } = groupComments([])
    expect(topLevel).toEqual([])
    expect(repliesByParent).toEqual({})
  })
})
