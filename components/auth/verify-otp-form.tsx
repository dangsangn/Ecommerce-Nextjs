'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { verifyOtpAction, resendOtpAction } from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function VerifyOtpForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(verifyOtpAction, initialActionState)
  const [resendState, resendAction] = useActionState(resendOtpAction, initialActionState)

  useEffect(() => {
    if (state.message) toast.error(state.message)
  }, [state])

  useEffect(() => {
    if (resendState.ok && resendState.message) toast.success(resendState.message)
    else if (!resendState.ok && resendState.message) toast.error(resendState.message)
  }, [resendState])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>Enter the 6-digit code sent to {email || 'your email'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <Input id="otp" name="otp" inputMode="numeric" maxLength={6} required placeholder="______" />
          </div>
          <SubmitButton>Verify</SubmitButton>
        </form>
        <form action={resendAction}>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" variant="ghost" className="w-full">Resend code</Button>
        </form>
      </CardContent>
    </Card>
  )
}
