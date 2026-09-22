// supabase/functions/payfast-itn/index.ts
//
// PayFast's Instant Transaction Notification (ITN) webhook handler.
//
// PayFast calls this endpoint server-to-server, so it does NOT use a
// Supabase user JWT.
//
// Security flow:
//   1. Parse PayFast notification
//   2. Verify PayFast signature
//   3. Confirm notification with PayFast
//   4. Protect against duplicate webhook events
//   5. Validate the order + amount
//   6. Atomically finalize payment, inventory and cart
//
// Deploy:
//   supabase functions deploy payfast-itn --no-verify-jwt

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
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function verifySignature(
  fields: Record<string, string>,
): Promise<boolean> {
  const { signature, ...rest } = fields

  if (!signature) {
    return false
  }

  const ordered = Object.entries(rest)
    .filter(([, value]) => value !== '' && value !== undefined)
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}`,
    )
    .join('&')

  const withPassphrase = payfastPassphrase
    ? `${ordered}&passphrase=${encodeURIComponent(
        payfastPassphrase.trim(),
      ).replace(/%20/g, '+')}`
    : ordered

  const computed = await md5(withPassphrase)

  return computed === signature
}

async function confirmWithPayFast(rawBody: string): Promise<boolean> {
  const host =
    payfastMode === 'live'
      ? 'www.payfast.co.za'
      : 'sandbox.payfast.co.za'

  const response = await fetch(`https://${host}/eng/query/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: rawBody,
  })

  if (!response.ok) {
    return false
  }

  const text = await response.text()

  return text.trim() === 'VALID'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  const rawBody = await req.text()

  const params = new URLSearchParams(rawBody)

  const fields: Record<string, string> = {}

  for (const [key, value] of params.entries()) {
    fields[key] = value
  }

  try {
    // ----------------------------------------------------------
    // 1. Verify PayFast signature
    // ----------------------------------------------------------

    const signatureValid = await verifySignature(fields)

    if (!signatureValid) {
      throw new Error('Invalid PayFast signature')
    }

    // ----------------------------------------------------------
    // 2. Confirm notification directly with PayFast
    // ----------------------------------------------------------

    const confirmed = await confirmWithPayFast(rawBody)

    if (!confirmed) {
      throw new Error(
        'PayFast did not confirm this notification',
      )
    }

    // ----------------------------------------------------------
    // 3. Identify the event
    // ----------------------------------------------------------

    const eventId =
      fields.pf_payment_id ??
      fields.m_payment_id

    if (!eventId) {
      throw new Error('Missing PayFast event identifier')
    }

    const orderId = fields.m_payment_id

    if (!orderId) {
      throw new Error('Missing order ID')
    }

    // ----------------------------------------------------------
    // 4. Idempotency
    // ----------------------------------------------------------

    const { error: eventInsertError } = await admin
      .from('webhook_events')
      .insert({
        provider: 'payfast',
        event_id: eventId,
        payload: fields,
      })

    if (eventInsertError) {
      // The unique(provider, event_id) constraint means this
      // notification has already been received.
      return new Response('OK (duplicate)', {
        status: 200,
        headers: corsHeaders,
      })
    }

    // ----------------------------------------------------------
    // 5. Load the order
    // ----------------------------------------------------------

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, user_id, status, total, currency')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      throw new Error('Order not found')
    }

    // ----------------------------------------------------------
    // 6. Validate PayFast amount
    // ----------------------------------------------------------

    const notifiedAmount = Number(
      fields.amount_gross ?? fields.amount,
    )

    if (!Number.isFinite(notifiedAmount)) {
      throw new Error('Invalid payment amount')
    }

    if (
      Math.abs(
        notifiedAmount - Number(order.total),
      ) > 0.01
    ) {
      throw new Error(
        'Payment amount does not match order total',
      )
    }

    // ----------------------------------------------------------
    // 7. Process payment status
    // ----------------------------------------------------------

    const paymentStatus = fields.payment_status

    if (!paymentStatus) {
      throw new Error('Missing PayFast payment status')
    }

    if (paymentStatus === 'COMPLETE') {
      // --------------------------------------------------------
      // Payment confirmed.
      //
      // finalize_paid_order() performs the following atomically:
      //
      //   - locks the order
      //   - checks stock
      //   - locks inventory rows
      //   - deducts inventory
      //   - marks payment as paid
      //   - marks order as paid
      //   - clears the customer's cart
      //
      // This prevents race conditions between simultaneous orders.
      // --------------------------------------------------------

      const { error: finalizeError } = await admin.rpc(
        'finalize_paid_order',
        {
          p_order_id: orderId,
          p_provider_reference:
            fields.pf_payment_id ?? '',
          p_amount: notifiedAmount,
          p_raw_payload: fields,
        },
      )

      if (finalizeError) {
        throw finalizeError
      }
    } else if (
      paymentStatus === 'FAILED' ||
      paymentStatus === 'CANCELLED'
    ) {
      // --------------------------------------------------------
      // Failed/cancelled payment.
      //
      // We keep the cart intact because payment did not succeed.
      // --------------------------------------------------------

      await admin
        .from('payments')
        .update({
          status:
            paymentStatus === 'FAILED'
              ? 'failed'
              : 'cancelled',
          provider_reference:
            fields.pf_payment_id ?? null,
          raw_payload: fields,
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', orderId)

      await admin
        .from('orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('status', 'pending_payment')
    }

    // ----------------------------------------------------------
    // 8. Mark webhook as processed
    // ----------------------------------------------------------

    await admin
      .from('webhook_events')
      .update({
        processed_at: new Date().toISOString(),
      })
      .eq('provider', 'payfast')
      .eq('event_id', eventId)

    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    })
  } catch (err) {
    console.error(
      'payfast-itn error:',
      err instanceof Error
        ? err.message
        : String(err),
    )

    return new Response('Rejected', {
      status: 200,
      headers: corsHeaders,
    })
  }
})