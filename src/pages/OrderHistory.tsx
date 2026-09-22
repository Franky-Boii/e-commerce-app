import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { Order } from '@/types'

async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
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

export default function OrderHistory() {
  const { data: orders, isLoading, error } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders })

  if (isLoading) return <div className="p-8 text-center">Loading orders…</div>
  if (error) return <div className="p-8 text-center text-red-600">Failed to load orders.</div>
  if (!orders?.length) return <div className="p-8 text-center text-gray-500">No orders yet.</div>

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Your orders</h1>
      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-center">
              <p className="font-medium">Order #{order.id.slice(0, 8)}</p>
              <span className={`text-sm font-medium ${statusColor[order.status] ?? ''}`}>
                {order.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {new Date(order.created_at).toLocaleDateString()} · {order.currency} {order.total.toFixed(2)}
            </p>
            <ul className="text-sm text-gray-700 mt-2 list-disc list-inside">
              {order.order_items?.map((item) => (
                <li key={item.id}>
                  {item.quantity} × {item.product_name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}