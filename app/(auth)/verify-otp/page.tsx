import { VerifyOtpForm } from '@/components/auth/verify-otp-form'

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  return <VerifyOtpForm email={email || ''} />
}
