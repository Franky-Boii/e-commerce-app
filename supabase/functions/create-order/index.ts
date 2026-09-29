// supabase/functions/create-order/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { corsHeaders } from '../_shared/cors.ts'

const DELIVERY_FEE = 60
const FREE_DELIVERY_THRESHOLD = 1000

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const payfastMerchantId = Deno.env.get('PAYFAST_MERCHANT_ID')!
const payfastMerchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY')!
const payfastPassphrase = Deno.env.get('PAYFAST_PASSPHRASE') ?? ''
const payfastMode = Deno.env.get('PAYFAST_MODE') ?? 'sandbox'
const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'

const admin = createClient(supabaseUrl, serviceRoleKey)

async function payfastSignature(fields: Record<string, string>): Promise<string> {
  const ordered = Object.entries(fields)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(
      ([k, v]) =>
        `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, '+')}`,
    )
    .join('&')

  const withPassphrase = payfastPassphrase
    ? `${ordered}&passphrase=${encodeURIComponent(
        payfastPassphrase.trim(),
      ).replace(/%20/g, '+')}`
    : ordered

  const data = new TextEncoder().encode(withPassphrase)

  const hashBuffer = await crypto.subtle.digest('MD5', data)

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  try {
    // ----------------------------------------------------------
    // 1. Authenticate the user
    // ----------------------------------------------------------

    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const jwt = authHeader.replace('Bearer ', '')

    const { data: userData, error: userError } =
      await admin.auth.getUser(jwt)

    if (userError || !userData.user) {
      throw new Error('Invalid session')
    }

    const userId = userData.user.id

    // ----------------------------------------------------------
    // 2. Read the requested shipping address
    // ----------------------------------------------------------

    const body = await req.json().catch(() => ({}))

    const addressId =
      typeof body.address_id === 'string'
        ? body.address_id
        : null

    if (!addressId) {
      throw new Error('Shipping address is required')
    }

    // IMPORTANT:
    // Because this query uses user_id as well as address_id,
    // a customer cannot submit another customer's address ID.
    const { data: address, error: addressError } = await admin
      .from('addresses')
      .select(
        'id, user_id, line1, line2, city, province, postal_code, country',
      )
      .eq('id', addressId)
      .eq('user_id', userId)
      .single()

    if (addressError || !address) {
      throw new Error('Invalid shipping address')
    }

    // ----------------------------------------------------------
    // 3. Load the user's cart
    // ----------------------------------------------------------

    const { data: cart, error: cartError } = await admin
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (cartError || !cart) {
      throw new Error('Cart not found')
    }

    const { data: cartItems, error: itemsError } = await admin
      .from('cart_items')
      .select(
        'id, quantity, product:products(id, name, sku, price, currency, status)',
      )
      .eq('cart_id', cart.id)

    if (itemsError) {
      throw itemsError
    }

    if (!cartItems?.length) {
      throw new Error('Cart is empty')
    }

    // ----------------------------------------------------------
    // 4. Validate stock for every item
    // ----------------------------------------------------------

    for (const item of cartItems) {
      const product = item.product as unknown as {
        id: string
        name: string
        sku: string
        price: number
        currency: string
        status: string
      }

      const { data: inv } = await admin
        .from('inventory')
        .select('quantity')
        .eq('product_id', product.id)
        .single()

      if (product.status !== 'active') {
        throw new Error(
          `${product.name} is no longer available`,
        )
      }

      if (!inv || inv.quantity < item.quantity) {
        throw new Error(
          `${product.name} does not have enough stock`,
        )
      }
    }

    // ----------------------------------------------------------
    // 5. Calculate totals server-side
    // ----------------------------------------------------------

    const subtotal = cartItems.reduce((sum, item) => {
      const product = item.product as unknown as {
        price: number
      }

      return sum + product.price * item.quantity
    }, 0)

    const deliveryFee =
      subtotal >= FREE_DELIVERY_THRESHOLD
        ? 0
        : DELIVERY_FEE

    const total = subtotal + deliveryFee

    const currency = (
      cartItems[0].product as unknown as {
        currency: string
      }
    ).currency

    // ----------------------------------------------------------
    // 6. Create the order
    // ----------------------------------------------------------

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id: userId,
        status: 'pending_payment',
        subtotal,
        delivery_fee: deliveryFee,
        total,
        currency,
        shipping_address_id: address.id,
      })
      .select()
      .single()

    if (orderError) {
      throw orderError
    }

    // ----------------------------------------------------------
    // 7. Snapshot order items
    // ----------------------------------------------------------

    const orderItemsPayload = cartItems.map((item) => {
      const product = item.product as unknown as {
        id: string
        name: string
        sku: string
        price: number
      }

      return {
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        unit_price: product.price,
        quantity: item.quantity,
        line_total: product.price * item.quantity,
      }
    })

    const { error: orderItemsError } = await admin
      .from('order_items')
      .insert(orderItemsPayload)

    if (orderItemsError) {
      throw orderItemsError
    }

    // ----------------------------------------------------------
    // 8. Create pending payment
    // ----------------------------------------------------------

    const { error: paymentError } = await admin
      .from('payments')
      .insert({
        order_id: order.id,
        provider: 'payfast',
        amount: total,
        currency,
        status: 'pending',
      })

    if (paymentError) {
      throw paymentError
    }

    // ----------------------------------------------------------
    // 9. Empty the cart
    // ----------------------------------------------------------

    const { error: clearCartError } = await admin
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id)

    if (clearCartError) {
      throw clearCartError
    }

    // ----------------------------------------------------------
    // 10. Build PayFast request
    // ----------------------------------------------------------

    const payfastHost =
      payfastMode === 'live'
        ? 'https://www.payfast.co.za/eng/process'
        : 'https://sandbox.payfast.co.za/eng/process'

    const fields: Record<string, string> = {
      merchant_id: payfastMerchantId,
      merchant_key: payfastMerchantKey,
      return_url: `${siteUrl}/orders`,
      cancel_url: `${siteUrl}/checkout`,
      notify_url: `${supabaseUrl}/functions/v1/payfast-itn`,
      email_address: userData.user.email ?? '',
      m_payment_id: order.id,
      amount: total.toFixed(2),
      item_name: `Order ${order.id.slice(0, 8)}`,
    }

    fields.signature = await payfastSignature(fields)

    return new Response(
      JSON.stringify({
        order_id: order.id,
        action_url: payfastHost,
        fields,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : 'Could not create order',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  }
})