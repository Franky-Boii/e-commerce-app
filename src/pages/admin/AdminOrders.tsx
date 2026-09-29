import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { OrderStatus } from '@/types'

interface AdminOrderItem {
  id: string
  product_name: string
  sku: string
  unit_price: number
  quantity: number
  line_total: number
}

interface AdminAddress {
  id: string
  line1: string
  line2: string | null
  city: string
  province: string | null
  postal_code: string
  country: string
}

interface AdminProfile {
  id: string
  full_name: string
}

interface AdminPayment {
  id: string
  provider: string
  reference: string | null
  amount: number
  currency: string
  status: string
}

interface AdminOrder {
  id: string
  user_id: string
  status: OrderStatus
  subtotal: number
  delivery_fee: number
  total: number
  currency: string
  created_at: string
  order_items: AdminOrderItem[]
  addresses: AdminAddress | null
  profiles: AdminProfile | null
  payments: AdminPayment[]
}

const statusLabel: Record<OrderStatus, string> = {
  pending_payment: 'Pending payment',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const statusColor: Record<OrderStatus, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  processing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-700',
  refunded: 'bg-red-100 text-red-800',
}

const statusOptions: OrderStatus[] = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

async function fetchAdminOrders(): Promise<AdminOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      status,
      subtotal,
      delivery_fee,
      total,
      currency,
      created_at,
      order_items(*),
      addresses:shipping_address_id(*),
      profiles:user_id(
        id,
        full_name
      ),
      payments(
        id,
        provider,
        reference,
        amount,
        currency,
        status
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as AdminOrder[]
}

export default function AdminOrders() {
  const queryClient = useQueryClient()

  const {
    data: orders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: fetchAdminOrders,
  })

  const updateOrderStatus = useMutation({
    mutationFn: async ({
      orderId,
      status,
    }: {
      orderId: string
      status: OrderStatus
    }) => {
      const { error } = await supabase
        .from('orders')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)

      if (error) {
        throw error
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin-orders'],
      })

      queryClient.invalidateQueries({
        queryKey: ['orders'],
      })
    },
  })

  function formatDate(date: string) {
    return new Date(date).toLocaleString('en-ZA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  function formatMoney(
    currency: string,
    amount: number
  ) {
    return `${currency} ${Number(amount).toFixed(2)}`
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-semibold mb-6">
          Admin — Orders
        </h1>

        <div className="border rounded-lg p-8 text-center text-gray-500">
          Loading orders…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-semibold mb-6">
          Admin — Orders
        </h1>

        <div className="border border-red-200 bg-red-50 rounded-lg p-6 text-red-700">
          <p className="font-medium">
            Failed to load orders.
          </p>

          <p className="text-sm mt-1">
            {error instanceof Error
              ? error.message
              : 'Unknown error'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">
          Admin — Orders
        </h1>

        <p className="text-gray-600 mt-2">
          View customer orders, payments, shipping
          addresses, and update order status.
        </p>
      </div>

      {!orders?.length ? (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          No orders found.
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => {
            const payment = order.payments?.[0]
            const address = order.addresses

            return (
              <div
                key={order.id}
                className="border rounded-xl bg-white shadow-sm overflow-hidden"
              >
                {/* Header */}
                <div className="p-5 border-b bg-gray-50">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                      <p className="font-semibold text-lg">
                        Order #{order.id.slice(0, 8)}
                      </p>

                      <p className="text-sm text-gray-500 mt-1">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <span
                        className={`inline-flex justify-center rounded-full px-3 py-1 text-sm font-medium ${
                          statusColor[order.status]
                        }`}
                      >
                        {statusLabel[order.status]}
                      </span>

                      <select
                        value={order.status}
                        disabled={
                          updateOrderStatus.isPending
                        }
                        onChange={(event) =>
                          updateOrderStatus.mutate({
                            orderId: order.id,
                            status:
                              event.target
                                .value as OrderStatus,
                          })
                        }
                        className="border rounded px-3 py-2 bg-white text-sm disabled:opacity-50"
                      >
                        {statusOptions.map(
                          (status) => (
                            <option
                              key={status}
                              value={status}
                            >
                              {statusLabel[status]}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Customer + Payment */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 border-b">
                  <div>
                    <h2 className="font-semibold mb-2">
                      Customer
                    </h2>

                    <div className="text-sm text-gray-600">
                      <p>
                        <span className="font-medium text-gray-900">
                          Name:
                        </span>{' '}
                        {order.profiles?.full_name ??
                          'Unknown customer'}
                      </p>

                      <p className="mt-1 break-all">
                        <span className="font-medium text-gray-900">
                          User ID:
                        </span>{' '}
                        {order.user_id}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h2 className="font-semibold mb-2">
                      Payment
                    </h2>

                    {payment ? (
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          <span className="font-medium text-gray-900">
                            Provider:
                          </span>{' '}
                          {payment.provider}
                        </p>

                        <p>
                          <span className="font-medium text-gray-900">
                            Status:
                          </span>{' '}
                          {payment.status}
                        </p>

                        {payment.reference && (
                          <p className="break-all">
                            <span className="font-medium text-gray-900">
                              Reference:
                            </span>{' '}
                            {payment.reference}
                          </p>
                        )}

                        <p>
                          <span className="font-medium text-gray-900">
                            Amount:
                          </span>{' '}
                          {formatMoney(
                            payment.currency,
                            payment.amount
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No payment record found.
                      </p>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="p-5 border-b">
                  <h2 className="font-semibold mb-3">
                    Order items
                  </h2>

                  <div className="divide-y">
                    {order.order_items?.map(
                      (item) => (
                        <div
                          key={item.id}
                          className="py-3 flex justify-between gap-4"
                        >
                          <div>
                            <p className="font-medium">
                              {item.product_name}
                            </p>

                            <p className="text-sm text-gray-500">
                              SKU: {item.sku}
                            </p>

                            <p className="text-sm text-gray-500">
                              {item.quantity} ×{' '}
                              {formatMoney(
                                order.currency,
                                item.unit_price
                              )}
                            </p>
                          </div>

                          <p className="font-medium whitespace-nowrap">
                            {formatMoney(
                              order.currency,
                              item.line_total
                            )}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Shipping address */}
                <div className="p-5 border-b">
                  <h2 className="font-semibold mb-2">
                    Shipping address
                  </h2>

                  {address ? (
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

                      <p>
                        {address.postal_code}
                      </p>

                      <p>{address.country}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No shipping address attached.
                    </p>
                  )}
                </div>

                {/* Totals */}
                <div className="p-5">
                  <div className="max-w-sm ml-auto space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        Subtotal
                      </span>

                      <span>
                        {formatMoney(
                          order.currency,
                          order.subtotal
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        Delivery
                      </span>

                      <span>
                        {formatMoney(
                          order.currency,
                          order.delivery_fee
                        )}
                      </span>
                    </div>

                    <div className="border-t pt-2 flex justify-between text-base font-semibold">
                      <span>Total</span>

                      <span>
                        {formatMoney(
                          order.currency,
                          order.total
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {updateOrderStatus.isError && (
                  <div className="mx-5 mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Failed to update order status. Please
                    try again.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
