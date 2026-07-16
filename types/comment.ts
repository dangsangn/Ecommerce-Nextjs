export interface CommentAuthor {
  name: string
  email: string
}

export interface Comment {
  id: string
  productId: string
  userId: string
  content: string
  parentId: string | null
  replyToUserId: string | null
  user?: CommentAuthor
  replyToUser?: CommentAuthor
  createdAt?: string
}
