// supabase/functions/payfast-itn/index.ts
//
// PayFast's Instant Transaction Notification (ITN) webhook handler.
// This is a public URL (PayFast calls it server-to-server), so it does
// NOT use the caller's JWT — instead it validates the payload itself:
// signature check, a server-to-server confirmation call back to
// PayFast, and an idempotency guard via webhook_events before touching
// any order/payment/inventory rows.
//
// Deploy:  supabase functions deploy payfast-itn --no-verify-jwt
// (--no-verify-jwt is required: PayFast is not a Supabase-authenticated caller)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const payfastPassphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
const payfastMode = Deno.env.get('PAYFAST_MODE') ?? 'sandbox'

const admin = createClient(supabaseUrl, serviceRoleKey)

async function md5(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('MD5', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function verifySignature(fields: Record<string, string>): Promise<boolean> {
  const { signature, ...rest } = fields
  const ordered = Object.entries(rest)
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`)
    .join('&')
  const withPassphrase = payfastPassphrase
    ? `${ordered}&passphrase=${encodeURIComponent(payfastPassphrase.trim()).replace(/%20/g, '+')}`
    : ordered
  return md5(withPassphrase).then((computed) => computed === signature)
}

// Server-to-server confirmation, as PayFast's integration guide requires:
// post the raw ITN body back to PayFast and expect "VALID".
async function confirmWithPayfast(rawBody: string): Promise<boolean> {
  const host = payfastMode === 'live' ? 'www.payfast.co.za' : 'sandbox.payfast.co.za'
  const res = await fetch(`https://${host}/eng/query/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: rawBody,
  })
  const text = await res.text()
  return text.trim() === 'VALID'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const rawBody = await req.text()
  const params = new URLSearchParams(rawBody)
  const fields: Record<string, string> = {}
  for (const [key, value] of params.entries()) fields[key] = value

  try {
    // 1. Signature check
    const signatureOk = await verifySignature(fields)
    if (!signatureOk) throw new Error('Invalid signature')

    // 2. Server-to-server confirmation with PayFast
    const confirmed = await confirmWithPayfast(rawBody)
    if (!confirmed) throw new Error('PayFast did not confirm this notification')

    // 3. Idempotency — pf_payment_id uniquely identifies this ITN
    const eventId = fields.pf_payment_id ?? fields.m_payment_id
    const { error: insertEventError } = await admin
      .from('webhook_events')
      .insert({ provider: 'payfast', event_id: eventId, payload: fields })
    if (insertEventError) {
      // Unique constraint violation = we've already processed this event.
      return new Response('OK (duplicate)', { headers: corsHeaders })
    }

    const orderId = fields.m_payment_id
    const { data: order } = await admin.from('orders').select('*').eq('id', orderId).single()
    if (!order) throw new Error('Order not found for this notification')

    // 4. Amount must match what we created the order with — never trust
    // the notification's amount blindly.
    const notifiedAmount = Number(fields.amount_gross ?? fields.amount)
    if (Math.abs(notifiedAmount - Number(order.total)) > 0.01) {
      throw new Error('Amount mismatch between order and ITN')
    }

    const paymentStatus = fields.payment_status // COMPLETE | FAILED | CANCELLED | PENDING

    await admin
      .from('payments')
      .update({
        status: paymentStatus === 'COMPLETE' ? 'paid' : paymentStatus.toLowerCase(),
        provider_reference: fields.pf_payment_id,
        raw_payload: fields,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId)

    if (paymentStatus === 'COMPLETE' && order.status === 'pending_payment') {
      // 5. Mark the order paid and decrement stock for each line item.
      await admin.from('orders').update({ status: 'paid' }).eq('id', orderId)

      const { data: orderItems } = await admin
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId)

      for (const item of orderItems ?? []) {
        if (!item.product_id) continue
        const { data: inv } = await admin
          .from('inventory')
          .select('quantity')
          .eq('product_id', item.product_id)
          .single()
        const newQty = Math.max((inv?.quantity ?? 0) - item.quantity, 0)
        await admin.from('inventory').update({ quantity: newQty }).eq('product_id', item.product_id)
      }
    } else if (['FAILED', 'CANCELLED'].includes(paymentStatus)) {
      await admin.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    }

    await admin
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('provider', 'payfast')
      .eq('event_id', eventId)

    return new Response('OK', { headers: corsHeaders })
  } catch (err) {
    console.error('payfast-itn error:', (err as Error).message)
    // Still return 200 so PayFast doesn't endlessly retry a payload we've
    // deliberately rejected (e.g. bad signature) — but log it for review.
    return new Response('Rejected', { status: 200, headers: corsHeaders })
  }
})
