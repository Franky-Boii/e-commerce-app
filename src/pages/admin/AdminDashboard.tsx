import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types'

// Minimal admin product management: list + create. Edit/delete and
// category/inventory management follow the same pattern — extend this
// page once the core flow (auth → catalog → cart → checkout) is verified
// working end to end.

async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, inventory(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as Product[]
}

export default function AdminDashboard() {
  const queryClient = useQueryClient()
  const { data: products } = useQuery({ queryKey: ['admin-products'], queryFn: fetchAllProducts })

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [error, setError] = useState<string | null>(null)

  const createProduct = useMutation({
    mutationFn: async () => {
      const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
      const { data: product, error: insertError } = await supabase
        .from('products')
        .insert({ name, sku, slug, price: Number(price), status: 'active' })
        .select()
        .single()
      if (insertError) throw insertError

      const { error: invError } = await supabase
        .from('inventory')
        .insert({ product_id: product.id, quantity: Number(stock) })
      if (invError) throw invError
    },
    onSuccess: () => {
      setName('')
      setSku('')
      setPrice('')
      setStock('0')
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create product'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    createProduct.mutate()
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Admin — Products</h1>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 mb-8 border rounded-lg p-4">
        {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}
        <input placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-3 py-2" />
        <input placeholder="SKU" required value={sku} onChange={(e) => setSku(e.target.value)} className="border rounded px-3 py-2" />
        <input placeholder="Price" type="number" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} className="border rounded px-3 py-2" />
        <input placeholder="Stock qty" type="number" required value={stock} onChange={(e) => setStock(e.target.value)} className="border rounded px-3 py-2" />
        <button type="submit" disabled={createProduct.isPending} className="col-span-2 bg-black text-white rounded py-2 disabled:opacity-50">
          {createProduct.isPending ? 'Creating…' : 'Create product'}
        </button>
      </form>

      <div className="space-y-2">
        {products?.map((p) => (
          <div key={p.id} className="flex justify-between border-b py-2 text-sm">
            <span>{p.name} ({p.sku})</span>
            <span>
              {p.currency} {p.price.toFixed(2)} · stock: {p.inventory?.quantity ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
