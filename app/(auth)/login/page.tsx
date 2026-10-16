import { LoginForm } from '@/components/auth/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; reset?: string }>
}) {
  const { redirect, reset } = await searchParams
  return <LoginForm redirectTo={redirect || '/seller'} justReset={reset === '1'} />
}
