export interface ApiEnvelope<T> {
  message: string
  statusCode: number
  data: T
}

export interface Tokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  _id: string
  email?: string
  name?: string
  usr_email?: string
  usr_name?: string
}

export interface LoginData {
  user: AuthUser
  tokens: Tokens
}

export interface JwtPayload {
  userId: string
  email: string
  roles: string[]
  type: 'access' | 'refresh'
  exp: number
  iat: number
}

export interface RefreshData {
  tokens: Tokens
  shop: { userId: string; email: string; roles: string[] }
}
