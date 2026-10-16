import 'server-only'
import { cookies } from 'next/headers'

// The reset ticket grants a password change, so it lives only in an httpOnly
// cookie — never in the URL or client state. See docs/forgot-password-flow-guide.md §6.2.
export const RESET_TICKET_COOKIE = 'reset_ticket'

export async function setResetTicket(ticket: string, maxAge: number): Promise<void> {
  const store = await cookies()
  store.set(RESET_TICKET_COOKIE, ticket, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge, // mirrors the backend's expiresIn
  })
}

export async function getResetTicket(): Promise<string | undefined> {
  const store = await cookies()
  return store.get(RESET_TICKET_COOKIE)?.value
}

export async function clearResetTicket(): Promise<void> {
  const store = await cookies()
  store.delete(RESET_TICKET_COOKIE)
}
