import { ApiError } from '@/lib/api/http'

// Extract a user-facing message from a caught error: the backend's message when
// it's an ApiError, otherwise a caller-provided fallback. Shared by Server Actions
// (which, being 'use server', can only export async functions themselves).
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback
}
