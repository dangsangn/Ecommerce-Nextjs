'use client'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  verifyResetOtpAction,
  resendResetOtpAction,
} from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Mirrors the backend's resend cooldown. Cosmetic only — the backend enforces it
// by silently skipping the send, so without this a second click looks like nothing happened.
const RESEND_COOLDOWN = 60

export function ResetOtpForm({ email }: { email: string }) {
  const router = useRouter()
  const [state, formAction] = useActionState(
    verifyResetOtpAction,
    initialActionState,
  )
  const [resendState, resendAction] = useActionState(
    resendResetOtpAction,
    initialActionState,
  )
  // The first code was just sent by /forgot-password, so start cooling down.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)

  useEffect(() => {
    // The action set the ticket cookie; re-render the server page to get the password form.
    if (state.ok) router.refresh()
    else if (state.message) toast.error(state.message)
  }, [state, router])

  useEffect(() => {
    if (resendState.ok && resendState.message)
      toast.success(resendState.message)
    else if (!resendState.ok && resendState.message)
      toast.error(resendState.message)
  }, [resendState])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter your reset code</CardTitle>
        <CardDescription>
          If an account exists for {email}, a 6-digit code is on its way. It
          expires in 5 minutes — check your spam folder too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <div className="space-y-2">
            <Label htmlFor="otp">Reset code</Label>
            <Input
              id="otp"
              name="otp"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="______"
              autoComplete="one-time-code"
            />
          </div>
          {!state.ok && state.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <SubmitButton>Continue</SubmitButton>
        </form>
        <form
          action={resendAction}
          onSubmit={() => setCooldown(RESEND_COOLDOWN)}
        >
          <input type="hidden" name="email" value={email} />
          <Button
            type="submit"
            variant="ghost"
            className="w-full"
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
