import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { Order } from '@/types'

async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      *,
      order_items(*),
      shipping_address:addresses(*)
      `,
    )
    .order('created_at', {
      ascending: false,
    })

  if (error) throw error

  return data as unknown as Order[]
}

const statusColor: Record<string, string> = {
  pending_payment: 'text-yellow-600',
  paid: 'text-green-600',
  processing: 'text-blue-600',
  shipped: 'text-blue-600',
  delivered: 'text-green-700',
  cancelled: 'text-gray-500',
  refunded: 'text-red-600',
}

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    )
}

export default function OrderHistory() {
  const {
    data: orders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
  })

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        Loading orders…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load orders.
      </div>
    )
  }

  if (!orders?.length) {
    return (
      <div className="p-8 text-center text-gray-500">
        No orders yet.
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">
        Your orders
      </h1>

      <div className="space-y-5">
        {orders.map((order) => (
          <div
            key={order.id}
            className="border rounded-lg p-5"
          >
            <div className="flex justify-between items-center gap-4">
              <p className="font-medium">
                Order #{order.id.slice(0, 8)}
              </p>

              <span
                className={`text-sm font-medium ${
                  statusColor[order.status] ?? ''
                }`}
              >
                {formatStatus(order.status)}
              </span>
            </div>

            <p className="text-sm text-gray-600 mt-1">
              {new Date(
                order.created_at,
              ).toLocaleDateString()}{' '}
              · {order.currency}{' '}
              {order.total.toFixed(2)}
            </p>

            <ul className="text-sm text-gray-700 mt-4 space-y-1">
              {order.order_items?.map((item) => (
                <li key={item.id}>
                  {item.quantity} ×{' '}
                  {item.product_name}
                  {' — '}
                  {order.currency}{' '}
                  {item.line_total.toFixed(2)}
                </li>
              ))}
            </ul>

            {order.shipping_address && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-2">
                  Shipping address
                </p>

                <div className="text-sm text-gray-600">
                  <p>
                    {order.shipping_address.line1}
                  </p>

                  {order.shipping_address.line2 && (
                    <p>
                      {order.shipping_address.line2}
                    </p>
                  )}

                  <p>
                    {order.shipping_address.city}
                    {order.shipping_address.province
                      ? `, ${order.shipping_address.province}`
                      : ''}
                  </p>

                  <p>
                    {order.shipping_address.postal_code},{' '}
                    {order.shipping_address.country}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t flex justify-between text-sm">
              <span>Subtotal</span>
              <span>
                {order.currency}{' '}
                {order.subtotal.toFixed(2)}
              </span>
            </div>

            <div className="mt-1 flex justify-between text-sm">
              <span>Delivery</span>
              <span>
                {order.delivery_fee === 0
                  ? 'FREE'
                  : `${order.currency} ${order.delivery_fee.toFixed(2)}`}
              </span>
            </div>

            <div className="mt-2 flex justify-between font-semibold">
              <span>Total</span>
              <span>
                {order.currency}{' '}
                {order.total.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}