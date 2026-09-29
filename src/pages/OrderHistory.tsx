import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { Order } from '@/types'

async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items(*),
      addresses(*)
    `)
    .order('created_at', { ascending: false })

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

const statusLabel: Record<string, string> = {
  pending_payment: 'Pending payment',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
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
      <div className="max-w-3xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-semibold mb-2">
          Your orders
        </h1>

        <p className="text-gray-500">
          You haven't placed any orders yet.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">
        Your orders
      </h1>

      <div className="space-y-6">
        {orders.map((order) => {
          const address = order.addresses

          return (
            <div
              key={order.id}
              className="border rounded-xl bg-white shadow-sm overflow-hidden"
            >
              {/* Order header */}
              <div className="p-5 border-b bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <p className="font-semibold">
                      Order #{order.id.slice(0, 8)}
                    </p>

                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(order.created_at).toLocaleDateString(
                        'en-ZA',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }
                      )}
                    </p>
                  </div>

                  <span
                    className={`text-sm font-semibold ${
                      statusColor[order.status] ?? 'text-gray-600'
                    }`}
                  >
                    {statusLabel[order.status] ??
                      order.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Products */}
              <div className="p-5">
                <h2 className="font-medium mb-3">
                  Items
                </h2>

                <div className="divide-y">
                  {order.order_items?.map((item) => (
                    <div
                      key={item.id}
                      className="py-3 flex justify-between gap-4"
                    >
                      <div>
                        <p className="font-medium">
                          {item.product_name}
                        </p>

                        <p className="text-sm text-gray-500">
                          {item.quantity} × {order.currency}{' '}
                          {Number(item.unit_price).toFixed(2)}
                        </p>
                      </div>

                      <p className="font-medium whitespace-nowrap">
                        {order.currency}{' '}
                        {Number(item.line_total).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shipping address */}
              {address && (
                <div className="px-5 pb-5">
                  <h2 className="font-medium mb-2">
                    Shipping address
                  </h2>

                  <div className="text-sm text-gray-600">
                    <p>{address.line1}</p>

                    {address.line2 && (
                      <p>{address.line2}</p>
                    )}

                    <p>
                      {address.city}
                      {address.province
                        ? `, ${address.province}`
                        : ''}
                    </p>

                    <p>{address.postal_code}</p>

                    <p>{address.country}</p>
                  </div>
                </div>
              )}

              {/* Order totals */}
              <div className="border-t p-5">
                <div className="max-w-sm ml-auto space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Subtotal
                    </span>

                    <span>
                      {order.currency}{' '}
                      {Number(order.subtotal).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Delivery
                    </span>

                    <span>
                      {order.currency}{' '}
                      {Number(order.delivery_fee).toFixed(2)}
                    </span>
                  </div>

                  <div className="border-t pt-2 flex justify-between text-base font-semibold">
                    <span>Total</span>

                    <span>
                      {order.currency}{' '}
                      {Number(order.total).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}