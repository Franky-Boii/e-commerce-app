import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabaseClient'

interface PayfastCheckout {
  order_id: string
  action_url: string
  fields: Record<string, string>
}

export default function Checkout() {
  const { items } = useCart()
  const { session } = useAuth()
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [checkout, setCheckout] = useState<PayfastCheckout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!session) navigate('/login')
  }, [session, navigate])

  async function startCheckout() {
    setSubmitting(true)
    setError(null)
    try {
      // The Edge Function re-validates the cart, current prices and stock
      // server-side and creates a pending_payment order — the totals
      // shown on the previous page are never trusted directly.
      const { data, error: fnError } = await supabase.functions.invoke<PayfastCheckout>(
        'create-order',
        { body: {} },
      )
      if (fnError) throw fnError
      if (!data) throw new Error('No response from create-order')
      setCheckout(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
    } finally {
      setSubmitting(false)
    }
  }

  // Once we have PayFast fields, auto-submit the form to redirect the
  // customer to PayFast's hosted payment page.
  useEffect(() => {
    if (checkout && formRef.current) {
      formRef.current.submit()
    }
  }, [checkout])

  if (!items.length) {
    return <div className="p-8 text-center text-gray-500">Your cart is empty.</div>
  }

  return (
    <div className="max-w-md mx-auto p-6 text-center">
      <h1 className="text-2xl font-semibold mb-4">Checkout</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {!checkout && (
        <button
          onClick={startCheckout}
          disabled={submitting}
          className="bg-black text-white rounded px-6 py-2 disabled:opacity-50"
        >
          {submitting ? 'Preparing payment…' : 'Pay with PayFast'}
        </button>
      )}

      {checkout && (
        <>
          <p className="text-sm text-gray-600 mb-4">Redirecting you to PayFast…</p>
          <form ref={formRef} action={checkout.action_url} method="POST">
            {Object.entries(checkout.fields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          </form>
        </>
      )}
    </div>
  )
}