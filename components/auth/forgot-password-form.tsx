'use client'
import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { forgotPasswordAction } from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialActionState)

  useEffect(() => {
    if (state.message) toast.error(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a 6-digit code to reset it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <SubmitButton>Send reset code</SubmitButton>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </CardContent>
    </Card>
  )
}
