'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { updateAvatarAction } from '@/actions/user.actions'
import { initialActionState } from '@/actions/state'
import { SubmitButton } from '@/components/auth/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function initials(email: string | undefined): string {
  if (!email) return '?'
  return email.slice(0, 2).toUpperCase()
}

export function AvatarForm({ email, avatarUrl }: { email?: string; avatarUrl?: string }) {
  const [state, formAction] = useActionState(updateAvatarAction, initialActionState)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    else if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your avatar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="Your avatar" /> : null}
            <AvatarFallback>{initials(email)}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{email ?? '—'}</span>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="avatar">New avatar</Label>
            <Input id="avatar" name="avatar" type="file" accept="image/*" required />
          </div>
          <SubmitButton>Upload avatar</SubmitButton>
        </form>
      </CardContent>
    </Card>
  )
}
