import { getAccessPayload } from '@/lib/auth/session'
import { logoutAction } from '@/actions/auth.actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SellerHomePage() {
  const payload = await getAccessPayload()
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Seller dashboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Signed in as: <span className="font-medium">{payload?.email ?? '—'}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Role: {payload?.roles?.join(', ') || 'user'}
        </p>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </CardContent>
    </Card>
  )
}
