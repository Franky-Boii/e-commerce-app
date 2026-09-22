import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/context/AuthContext'

async function fetchProduct(slug: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*), inventory(*)')
    .eq('slug', slug)
    .single()
  if (error) throw error
  return data as unknown as Product
}

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { session } = useAuth()
  const { addItem } = useCart()
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => fetchProduct(slug!),
    enabled: !!slug,
  })

  if (isLoading) return <div className="p-8 text-center">Loading…</div>
  if (error || !product) return <div className="p-8 text-center text-red-600">Product not found.</div>

  const stock = product.inventory?.quantity ?? 0
  const image = product.product_images?.[0]?.url

  async function handleAdd() {
    if (!session) {
      setMessage('Log in to add items to your cart.')
      return
    }
    setAdding(true)
    setMessage(null)
    try {
      await addItem(product!, 1)
      setMessage('Added to cart.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add to cart')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 grid sm:grid-cols-2 gap-8">
      <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
        {image ? (
          <img src={image} alt={product.name} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <span className="text-gray-400">No image</span>
        )}
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-xl mt-2">
          {product.currency} {product.price.toFixed(2)}
        </p>
        <p className="text-sm text-gray-600 mt-4">{product.description}</p>
        <p className="text-sm mt-4">
          {stock > 0 ? `${stock} in stock` : <span className="text-red-600">Out of stock</span>}
        </p>
        <button
          onClick={handleAdd}
          disabled={adding || stock <= 0}
          className="mt-6 bg-black text-white rounded px-6 py-2 disabled:opacity-50"
        >
          {adding ? 'Adding…' : 'Add to cart'}
        </button>
        {message && <p className="text-sm mt-3">{message}</p>}
      </div>
    </div>
  )
}