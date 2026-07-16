export interface Comment {
  id: string
  productId: string
  userId: string
  content: string
  parentId: string | null
  replyToUserId: string | null
  createdAt?: string
}
