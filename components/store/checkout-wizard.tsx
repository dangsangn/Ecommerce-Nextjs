'use client'
import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { placeOrderAction } from '@/actions/order.actions'
import { initialActionState } from '@/actions/state'
import { toPriceString } from '@/lib/products/price'
import { SubmitButton } from '@/components/auth/submit-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CheckoutOrder, OrderProduct, ShopOrderItem } from '@/types/order'

export function CheckoutWizard({
  shopOrderIds,
  review,
  lines,
}: {
  shopOrderIds: ShopOrderItem[]
  review: CheckoutOrder
  lines: OrderProduct[]
}) {
  const [step, setStep] = useState(0)
  const [address, setAddress] = useState({ street: '', city: '', state: '', country: '' })
  const [method, setMethod] = useState('COD')
  const [state, formAction] = useActionState(placeOrderAction, initialActionState)

  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message)
  }, [state])

  const addressComplete = address.street && address.city && address.state && address.country
  const set = (k: keyof typeof address) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddress((a) => ({ ...a, [k]: e.target.value }))

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>
          {step === 0 ? 'Review your order' : step === 1 ? 'Shipping & payment' : 'Confirm'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 0 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-3 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.thumb} alt={l.name} className="h-12 w-12 rounded border object-cover" />
                  <span className="flex-1">{l.name}</span>
                  <span className="text-muted-foreground">× {l.quantity}</span>
                  <span className="tabular-nums">{toPriceString(l.price)}</span>
                </div>
              ))}
            </div>
            <dl className="space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{toPriceString(review.totalPrice)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">−{toPriceString(review.totalDiscount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular-nums">{toPriceString(review.feeShip)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{toPriceString(review.totalCheckout)}</dd></div>
            </dl>
            <Button onClick={() => setStep(1)}>Continue</Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="street">Street</Label><Input id="street" value={address.street} onChange={set('street')} /></div>
              <div className="space-y-2"><Label htmlFor="city">City</Label><Input id="city" value={address.city} onChange={set('city')} /></div>
              <div className="space-y-2"><Label htmlFor="state">State</Label><Input id="state" value={address.state} onChange={set('state')} /></div>
              <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" value={address.country} onChange={set('country')} /></div>
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'COD')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COD">Cash on delivery</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="MOMO">MoMo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)} disabled={!addressComplete}>Continue</Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="shop_order_ids" value={JSON.stringify(shopOrderIds)} />
            <input type="hidden" name="street" value={address.street} />
            <input type="hidden" name="city" value={address.city} />
            <input type="hidden" name="state" value={address.state} />
            <input type="hidden" name="country" value={address.country} />
            <input type="hidden" name="paymentMethod" value={method} />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Ship to</p>
              <p className="text-muted-foreground">{address.street}, {address.city}, {address.state}, {address.country}</p>
              <p className="text-muted-foreground">Payment: {method}</p>
            </div>
            <p className="text-lg font-semibold tabular-nums">Total {toPriceString(review.totalCheckout)}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
              <SubmitButton>Place order</SubmitButton>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
