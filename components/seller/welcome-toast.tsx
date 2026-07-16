'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

// Shows the "You're now a shop" toast after the upgrade redirect, then strips
// the ?welcome=1 flag so it doesn't fire again on refresh.
export function WelcomeToast() {
  const router = useRouter()
  const params = useSearchParams()
  const welcome = params.get('welcome')

  useEffect(() => {
    if (welcome !== '1') return
    toast.success("You're now a shop — welcome to Seller Centre")
    router.replace('/seller')
  }, [welcome, router])

  return null
}
