'use client'
import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { resetPasswordAction, cancelResetAction } from '@/actions/auth.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ResetPasswordForm() {
  const router = useRouter()
  const [state, formAction] = useActionState(resetPasswordAction, initialActionState)

  useEffect(() => {
    if (!state.message) return
    toast.error(state.message)
    // If the action cleared a dead ticket, the server page falls back to an earlier step.
    router.refresh()
  }, [state, router])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          You&apos;ll be signed out everywhere and will need to sign in again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          {/* Kept inline as well as toasted: React resets the form after the action,
              so once the toast fades nothing else would show the attempt failed. */}
          {!state.ok && state.message && (
            <p role="alert" className="text-sm text-destructive">{state.message}</p>
          )}
          <SubmitButton>Reset password</SubmitButton>
        </form>
        <form action={cancelResetAction}>
          <Button type="submit" variant="ghost" className="w-full">Start over</Button>
        </form>
      </CardContent>
    </Card>
  )
}
