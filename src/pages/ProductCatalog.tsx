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
  const { data: products, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  })

  if (isLoading) return <div className="p-8 text-center">Loading products…</div>
  if (error) return <div className="p-8 text-center text-red-600">Failed to load products.</div>
  if (!products?.length) return <div className="p-8 text-center text-gray-500">No products yet.</div>

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Shop</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((p) => {
          const image = p.product_images?.[0]?.url
          const outOfStock = (p.inventory?.quantity ?? 0) <= 0
          return (
            <Link
              key={p.id}
              to={`/products/${p.slug}`}
              className="border rounded-lg overflow-hidden hover:shadow-md transition"
            >
              <div className="aspect-square bg-gray-100 flex items-center justify-center">
                {image ? (
                  <img src={image} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-400 text-sm">No image</span>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-sm text-gray-600">
                  {p.currency} {p.price.toFixed(2)}
                </p>
                {outOfStock && <p className="text-xs text-red-600 mt-1">Out of stock</p>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}