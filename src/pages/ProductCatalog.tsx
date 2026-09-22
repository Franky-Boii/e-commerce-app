import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types'

interface Category {
  id: string
  name: string
  slug: string
}

type SortOption =
  | 'newest'
  | 'price-low'
  | 'price-high'
  | 'name-az'

async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*), inventory(*)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error

  return data as unknown as Product[]
}

async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug')
    .order('name', { ascending: true })

  if (error) throw error

  return data as Category[]
}

export default function ProductCatalog() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')

  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
  } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  })

  const {
    data: categories,
    isLoading: categoriesLoading,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const filteredProducts = useMemo(() => {
    if (!products) return []

    const searchTerm = search.trim().toLowerCase()

    const result = products.filter((product) => {
      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm) ||
        product.sku.toLowerCase().includes(searchTerm)

      const matchesCategory =
        !categoryId ||
        product.category_id === categoryId

      return matchesSearch && matchesCategory
    })

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.price - b.price

        case 'price-high':
          return b.price - a.price

        case 'name-az':
          return a.name.localeCompare(b.name)

        case 'newest':
        default:
          return 0
      }
    })
  }, [products, search, categoryId, sortBy])

  const hasFilters =
    search.trim() !== '' ||
    categoryId !== '' ||
    sortBy !== 'newest'

  function clearFilters() {
    setSearch('')
    setCategoryId('')
    setSortBy('newest')
  }

  if (productsLoading) {
    return (
      <div className="p-8 text-center text-gray-600">
        Loading products…
      </div>
    )
  }

  if (productsError) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load products.
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          Shop
        </h1>

        <p className="text-sm text-gray-500 mt-1">
          Browse our products and find what you need.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 border rounded-lg p-4 mb-8">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label
              htmlFor="product-search"
              className="block text-sm font-medium mb-1"
            >
              Search
            </label>

            <input
              id="product-search"
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search products or SKU..."
              className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="category-filter"
              className="block text-sm font-medium mb-1"
            >
              Category
            </label>

            <select
              id="category-filter"
              value={categoryId}
              onChange={(event) =>
                setCategoryId(event.target.value)
              }
              disabled={categoriesLoading}
              className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-black"
            >
              <option value="">
                All categories
              </option>

              {categories?.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label
              htmlFor="sort-products"
              className="block text-sm font-medium mb-1"
            >
              Sort by
            </label>

            <select
              id="sort-products"
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as SortOption
                )
              }
              className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-black"
            >
              <option value="newest">
                Newest
              </option>

              <option value="price-low">
                Price: Low to High
              </option>

              <option value="price-high">
                Price: High to Low
              </option>

              <option value="name-az">
                Name: A to Z
              </option>
            </select>
          </div>
        </div>

        {/* Filter actions */}
        {hasFilters && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {filteredProducts.length}{' '}
              {filteredProducts.length === 1
                ? 'product'
                : 'products'}
            </p>

            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium underline hover:no-underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Result count */}
      {!hasFilters && (
        <p className="text-sm text-gray-500 mb-4">
          {filteredProducts.length}{' '}
          {filteredProducts.length === 1
            ? 'product'
            : 'products'}
        </p>
      )}

      {/* Empty state */}
      {filteredProducts.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <div className="text-4xl mb-3">
            🔍
          </div>

          <h2 className="text-lg font-medium">
            No products found
          </h2>

          <p className="text-sm text-gray-500 mt-2">
            Try changing your search or filters.
          </p>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 bg-black text-white rounded-lg px-5 py-2"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        /* Product grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredProducts.map((product) => {
            const image =
              product.product_images?.[0]?.url

            const imageAlt =
              product.product_images?.[0]?.alt_text ||
              product.name

            const outOfStock =
              (product.inventory?.quantity ?? 0) <= 0

            return (
              <Link
                key={product.id}
                to={`/products/${product.slug}`}
                className="group border rounded-lg overflow-hidden bg-white hover:shadow-lg transition-shadow"
              >
                {/* Image */}
                <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                  {image ? (
                    <img
                      src={image}
                      alt={imageAlt}
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

                {/* Product information */}
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
      )}
    </div>
  )
}