import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types'

async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*), inventory(*)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error

  return data as unknown as Product[]
}

export default function ProductCatalog() {
  const {
    data: products,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  })

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-600">
        Loading products…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load products.
      </div>
    )
  }

  if (!products?.length) {
    return (
      <div className="p-8 text-center text-gray-500">
        No products yet.
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Shop</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((product) => {
          const image = product.product_images?.[0]?.url
          const outOfStock =
            (product.inventory?.quantity ?? 0) <= 0

          return (
            <Link
              key={product.id}
              to={`/products/${product.slug}`}
              className="group border rounded-lg overflow-hidden bg-white hover:shadow-lg transition-shadow"
            >
              <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                {image ? (
                  <img
                    src={image}
                    alt={
                      product.product_images?.[0]?.alt_text ||
                      product.name
                    }
                    loading="lazy"
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="text-center">
                    <div className="text-3xl text-gray-300 mb-2">
                      📦
                    </div>
                    <span className="text-sm text-gray-400">
                      No image
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4">
                <p className="font-medium truncate">
                  {product.name}
                </p>

                <p className="text-sm text-gray-600 mt-1">
                  {product.currency}{' '}
                  {product.price.toFixed(2)}
                </p>

                {outOfStock && (
                  <p className="text-xs text-red-600 mt-2">
                    Out of stock
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}