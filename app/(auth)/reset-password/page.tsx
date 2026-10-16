import { redirect } from 'next/navigation'
import { getResetTicket } from '@/lib/auth/reset-ticket'
import { ResetOtpForm } from '@/components/auth/reset-otp-form'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  // The phase is derived from the cookie on the server, so a reload keeps the user
  // on the right step: ticket present → OTP already verified → new password.
  if (await getResetTicket()) return <ResetPasswordForm />

  if (!email) redirect('/forgot-password')

  return <ResetOtpForm email={email} />
}
