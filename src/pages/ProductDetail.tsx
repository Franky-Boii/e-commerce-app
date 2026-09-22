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
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  const {
    data: product,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => fetchProduct(slug!),
    enabled: !!slug,
  })

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-600">
        Loading…
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="p-8 text-center text-red-600">
        Product not found.
      </div>
    )
  }

  const images = [...(product.product_images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )

  const selectedImage = images[selectedImageIndex]
  const stock = product.inventory?.quantity ?? 0

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
      setMessage(
        err instanceof Error
          ? err.message
          : 'Could not add to cart'
      )
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="grid md:grid-cols-2 gap-10">
        {/* Product Images */}
        <div>
          <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
            {selectedImage ? (
              <img
                src={selectedImage.url}
                alt={
                  selectedImage.alt_text ||
                  product.name
                }
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-center">
                <div className="text-5xl text-gray-300 mb-3">
                  📦
                </div>
                <span className="text-gray-400">
                  No image available
                </span>
              </div>
            )}
          </div>

          {/* Image thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-3 mt-4 overflow-x-auto">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() =>
                    setSelectedImageIndex(index)
                  }
                  className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 ${
                    selectedImageIndex === index
                      ? 'border-black'
                      : 'border-gray-200'
                  }`}
                >
                  <img
                    src={image.url}
                    alt={
                      image.alt_text ||
                      `${product.name} ${index + 1}`
                    }
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Information */}
        <div>
          <h1 className="text-3xl font-semibold">
            {product.name}
          </h1>

          <p className="text-2xl mt-3 font-medium">
            {product.currency}{' '}
            {product.price.toFixed(2)}
          </p>

          {product.description && (
            <p className="text-gray-600 mt-5 leading-relaxed">
              {product.description}
            </p>
          )}

          <div className="mt-6">
            {stock > 0 ? (
              <p className="text-sm text-green-700">
                {stock} in stock
              </p>
            ) : (
              <p className="text-sm text-red-600">
                Out of stock
              </p>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={adding || stock <= 0}
            className="mt-6 bg-black text-white rounded-lg px-8 py-3 disabled:opacity-50 hover:bg-gray-800 transition"
          >
            {adding ? 'Adding…' : 'Add to cart'}
          </button>

          {message && (
            <p className="text-sm mt-4 text-gray-700">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}