import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '@/context/CartContext'

export default function Cart() {
  const { items, loading, subtotal, updateQuantity, removeItem } = useCart()
  const navigate = useNavigate()

  if (loading) return <div className="p-8 text-center">Loading cart…</div>

  if (!items.length) {
    return (
      <div className="p-8 text-center text-gray-500">
        Your cart is empty. <Link to="/" className="underline">Keep shopping</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Your cart</h1>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between border-b pb-4">
            <div>
              <p className="font-medium">{item.product?.name}</p>
              <p className="text-sm text-gray-600">
                {item.product?.currency} {item.product?.price.toFixed(2)} each
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                className="w-16 border rounded px-2 py-1"
              />
              <button
                onClick={() => removeItem(item.id)}
                className="text-sm text-red-600 underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-between items-center">
        <p className="text-lg">
          Subtotal: <span className="font-semibold">R{subtotal.toFixed(2)}</span>
        </p>
        <button
          onClick={() => navigate('/checkout')}
          className="bg-black text-white rounded px-6 py-2"
        >
          Checkout
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Final total (incl. delivery) is confirmed at checkout.
      </p>
    </div>
  )
}