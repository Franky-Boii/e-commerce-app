import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types'

interface Category {
  id: string
  name: string
  slug: string
}

type ProductForm = {
  name: string
  sku: string
  description: string
  price: string
  currency: string
  stock: string
  status: 'active' | 'inactive' | 'archived'
  category_id: string
}

const emptyForm: ProductForm = {
  name: '',
  sku: '',
  description: '',
  price: '',
  currency: 'ZAR',
  stock: '0',
  status: 'active',
  category_id: '',
}

async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, inventory(*), product_images(*), categories(*)')
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

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getFileExtension(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (!extension) {
    return 'jpg'
  }

  return extension
}

async function uploadProductImage(
  productId: string,
  file: File
): Promise<string> {
  const extension = getFileExtension(file)

  const filePath = `${productId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (uploadError) {
    throw uploadError
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from('product-images')
    .getPublicUrl(filePath)

  return publicUrl
}

export default function AdminDashboard() {
  const queryClient = useQueryClient()

  const {
    data: products,
    isLoading,
    error: productsError,
  } = useQuery({
    queryKey: ['admin-products'],
    queryFn: fetchAllProducts,
  })

  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null)

  const [selectedImage, setSelectedImage] =
    useState<File | null>(null)

  const [imagePreview, setImagePreview] =
    useState<string | null>(null)

  const [categoryName, setCategoryName] = useState('')
  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [categoryError, setCategoryError] =
    useState<string | null>(null)

  useEffect(() => {
    if (!editingProduct) {
      setForm(emptyForm)
      setSelectedImage(null)
      setImagePreview(null)
      return
    }

    setForm({
      name: editingProduct.name,
      sku: editingProduct.sku,
      description: editingProduct.description ?? '',
      price: String(editingProduct.price),
      currency: editingProduct.currency,
      stock: String(
        editingProduct.inventory?.quantity ?? 0
      ),
      status: editingProduct.status,
      category_id: editingProduct.category_id ?? '',
    })

    setSelectedImage(null)

    const existingImage =
      editingProduct.product_images?.[0]

    setImagePreview(existingImage?.url ?? null)
  }, [editingProduct])

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file) {
      setSelectedImage(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.')
      setSelectedImage(null)
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5 MB.')
      setSelectedImage(null)
      return
    }

    setError(null)
    setSuccess(null)

    setSelectedImage(file)

    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
  }

  const createCategory = useMutation({
    mutationFn: async () => {
      const name = categoryName.trim()

      if (!name) {
        throw new Error('Category name is required.')
      }

      const slug = createSlug(name)

      if (!slug) {
        throw new Error(
          'Category name must contain letters or numbers.'
        )
      }

      const { error: insertError } = await supabase
        .from('categories')
        .insert({
          name,
          slug,
        })

      if (insertError) throw insertError
    },

    onSuccess: () => {
      setCategoryName('')
      setCategoryError(null)
      setSuccess('Category created successfully.')

      queryClient.invalidateQueries({
        queryKey: ['categories'],
      })
    },

    onError: (err) => {
      setSuccess(null)
      setCategoryError(
        err instanceof Error
          ? err.message
          : 'Failed to create category.'
      )
    },
  })

  const updateCategory = useMutation({
    mutationFn: async () => {
      if (!editingCategory) {
        throw new Error(
          'No category selected for editing.'
        )
      }

      const name = categoryName.trim()

      if (!name) {
        throw new Error('Category name is required.')
      }

      const slug = createSlug(name)

      if (!slug) {
        throw new Error(
          'Category name must contain letters or numbers.'
        )
      }

      const { error: updateError } = await supabase
        .from('categories')
        .update({
          name,
          slug,
        })
        .eq('id', editingCategory.id)

      if (updateError) throw updateError
    },

    onSuccess: () => {
      setCategoryName('')
      setEditingCategory(null)
      setCategoryError(null)
      setSuccess('Category updated successfully.')

      queryClient.invalidateQueries({
        queryKey: ['categories'],
      })

      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      queryClient.invalidateQueries({
        queryKey: ['products'],
      })
    },

    onError: (err) => {
      setSuccess(null)
      setCategoryError(
        err instanceof Error
          ? err.message
          : 'Failed to update category.'
      )
    },
  })

  const createProduct = useMutation({
    mutationFn: async () => {
      const name = form.name.trim()
      const sku = form.sku.trim()

      if (!name) {
        throw new Error('Product name is required.')
      }

      if (!sku) {
        throw new Error('SKU is required.')
      }

      const price = Number(form.price)
      const stock = Number(form.stock)

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(
          'Price must be a valid number greater than or equal to 0.'
        )
      }

      if (!Number.isInteger(stock) || stock < 0) {
        throw new Error(
          'Stock must be a whole number greater than or equal to 0.'
        )
      }

      const slug = createSlug(name)

      const { data: product, error: insertError } =
        await supabase
          .from('products')
          .insert({
            name,
            sku,
            slug,
            description:
              form.description.trim() || null,
            price,
            currency:
              form.currency.trim() || 'ZAR',
            category_id:
              form.category_id || null,
            status: form.status,
          })
          .select()
          .single()

      if (insertError) throw insertError

      const { error: inventoryError } =
        await supabase
          .from('inventory')
          .insert({
            product_id: product.id,
            quantity: stock,
          })

      if (inventoryError) {
        await supabase
          .from('products')
          .delete()
          .eq('id', product.id)

        throw inventoryError
      }

      if (selectedImage) {
        try {
          const publicUrl =
            await uploadProductImage(
              product.id,
              selectedImage
            )

          const { error: imageError } =
            await supabase
              .from('product_images')
              .insert({
                product_id: product.id,
                url: publicUrl,
                alt_text: name,
                sort_order: 0,
              })

          if (imageError) {
            throw imageError
          }
        } catch (imageError) {
          await supabase
            .from('inventory')
            .delete()
            .eq('product_id', product.id)

          await supabase
            .from('products')
            .delete()
            .eq('id', product.id)

          throw imageError
        }
      }
    },

    onSuccess: () => {
      setForm(emptyForm)
      setSelectedImage(null)
      setImagePreview(null)
      setError(null)
      setSuccess('Product created successfully.')

      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      queryClient.invalidateQueries({
        queryKey: ['products'],
      })
    },

    onError: (err) => {
      setSuccess(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create product.'
      )
    },
  })

  const updateProduct = useMutation({
    mutationFn: async () => {
      if (!editingProduct) {
        throw new Error(
          'No product selected for editing.'
        )
      }

      const name = form.name.trim()
      const sku = form.sku.trim()
      const description = form.description.trim()
      const currency =
        form.currency.trim() || 'ZAR'

      if (!name) {
        throw new Error('Product name is required.')
      }

      if (!sku) {
        throw new Error('SKU is required.')
      }

      const price = Number(form.price)
      const stock = Number(form.stock)

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(
          'Price must be a valid number greater than or equal to 0.'
        )
      }

      if (!Number.isInteger(stock) || stock < 0) {
        throw new Error(
          'Stock must be a whole number greater than or equal to 0.'
        )
      }

      const slug = createSlug(name)

      const { error: productError } =
        await supabase
          .from('products')
          .update({
            name,
            sku,
            slug,
            description: description || null,
            price,
            currency,
            category_id:
              form.category_id || null,
            status: form.status,
            updated_at:
              new Date().toISOString(),
          })
          .eq('id', editingProduct.id)

      if (productError) throw productError

      const { error: inventoryError } =
        await supabase
          .from('inventory')
          .upsert({
            product_id: editingProduct.id,
            quantity: stock,
            updated_at:
              new Date().toISOString(),
          })

      if (inventoryError) throw inventoryError

      if (selectedImage) {
        const publicUrl =
          await uploadProductImage(
            editingProduct.id,
            selectedImage
          )

        const {
          data: existingImages,
          error: existingImagesError,
        } = await supabase
          .from('product_images')
          .select('id, url')
          .eq(
            'product_id',
            editingProduct.id
          )
          .order('sort_order', {
            ascending: true,
          })

        if (existingImagesError) {
          throw existingImagesError
        }

        if (
          existingImages &&
          existingImages.length > 0
        ) {
          const firstImage =
            existingImages[0]

          const {
            error: imageUpdateError,
          } = await supabase
            .from('product_images')
            .update({
              url: publicUrl,
              alt_text: name,
            })
            .eq('id', firstImage.id)

          if (imageUpdateError) {
            throw imageUpdateError
          }
        } else {
          const {
            error: imageInsertError,
          } = await supabase
            .from('product_images')
            .insert({
              product_id:
                editingProduct.id,
              url: publicUrl,
              alt_text: name,
              sort_order: 0,
            })

          if (imageInsertError) {
            throw imageInsertError
          }
        }
      }
    },

    onSuccess: () => {
      setEditingProduct(null)
      setForm(emptyForm)
      setSelectedImage(null)
      setImagePreview(null)
      setError(null)
      setSuccess('Product updated successfully.')

      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      queryClient.invalidateQueries({
        queryKey: ['products'],
      })
    },

    onError: (err) => {
      setSuccess(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update product.'
      )
    },
  })

  const toggleProductStatus = useMutation({
    mutationFn: async (product: Product) => {
      const nextStatus =
        product.status === 'active'
          ? 'inactive'
          : 'active'

      const { error: updateError } =
        await supabase
          .from('products')
          .update({
            status: nextStatus,
            updated_at:
              new Date().toISOString(),
          })
          .eq('id', product.id)

      if (updateError) throw updateError
    },

    onSuccess: (_, product) => {
      setError(null)
      setSuccess(
        product.status === 'active'
          ? 'Product deactivated.'
          : 'Product activated.'
      )

      queryClient.invalidateQueries({
        queryKey: ['admin-products'],
      })

      queryClient.invalidateQueries({
        queryKey: ['products'],
      })
    },

    onError: (err) => {
      setSuccess(null)
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update product status.'
      )
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    setError(null)
    setSuccess(null)

    if (editingProduct) {
      updateProduct.mutate()
    } else {
      createProduct.mutate()
    }
  }

  function handleCategorySubmit(
    event: FormEvent
  ) {
    event.preventDefault()

    setCategoryError(null)
    setSuccess(null)

    if (editingCategory) {
      updateCategory.mutate()
    } else {
      createCategory.mutate()
    }
  }

  function handleEdit(product: Product) {
    setError(null)
    setSuccess(null)
    setEditingProduct(product)

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  function handleCancelEdit() {
    setEditingProduct(null)
    setForm(emptyForm)
    setSelectedImage(null)
    setImagePreview(null)
    setError(null)
    setSuccess(null)
  }

  function handleEditCategory(
    category: Category
  ) {
    setCategoryError(null)
    setSuccess(null)
    setEditingCategory(category)
    setCategoryName(category.name)
  }

  function handleCancelCategoryEdit() {
    setEditingCategory(null)
    setCategoryName('')
    setCategoryError(null)
  }

  const isSaving =
    createProduct.isPending ||
    updateProduct.isPending

  const isSavingCategory =
    createCategory.isPending ||
    updateCategory.isPending

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">
          Admin — Store Management
        </h1>

        <p className="text-gray-600 mt-2">
          Manage categories, products, stock,
          images, and product availability.
        </p>
      </div>

      {/* Categories */}
      <section className="border rounded-lg p-6 mb-8 bg-white shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-semibold">
            Categories
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Create and manage product categories.
          </p>
        </div>

        <form
          onSubmit={handleCategorySubmit}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            value={categoryName}
            onChange={(event) =>
              setCategoryName(event.target.value)
            }
            placeholder="Category name"
            className="flex-1 border rounded px-3 py-2"
          />

          <button
            type="submit"
            disabled={isSavingCategory}
            className="bg-black text-white rounded px-5 py-2 disabled:opacity-50"
          >
            {isSavingCategory
              ? 'Saving…'
              : editingCategory
                ? 'Save category'
                : 'Add category'}
          </button>

          {editingCategory && (
            <button
              type="button"
              onClick={handleCancelCategoryEdit}
              className="border rounded px-5 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </form>

        {categoryError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {categoryError}
          </div>
        )}

        {categoriesError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load categories.
          </div>
        )}

        <div className="mt-5 space-y-2">
          {categoriesLoading ? (
            <p className="text-sm text-gray-500">
              Loading categories…
            </p>
          ) : !categories?.length ? (
            <p className="text-sm text-gray-500">
              No categories yet.
            </p>
          ) : (
            categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-4 border rounded-lg px-4 py-3"
              >
                <div>
                  <p className="font-medium">
                    {category.name}
                  </p>

                  <p className="text-xs text-gray-500">
                    /{category.slug}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleEditCategory(category)
                  }
                  className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Edit
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Product form */}
      <form
        onSubmit={handleSubmit}
        className="border rounded-lg p-6 mb-8 bg-white shadow-sm"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold">
              {editingProduct
                ? 'Edit Product'
                : 'Create Product'}
            </h2>

            {editingProduct && (
              <p className="text-sm text-gray-500 mt-1">
                Editing: {editingProduct.name}
              </p>
            )}
          </div>

          {editingProduct && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-sm border rounded px-3 py-2 hover:bg-gray-50"
            >
              Cancel edit
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Product name
            </label>

            <input
              type="text"
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Product name"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              SKU
            </label>

            <input
              type="text"
              required
              value={form.sku}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sku: event.target.value,
                }))
              }
              placeholder="SKU-001"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Price
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  price: event.target.value,
                }))
              }
              placeholder="0.00"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Currency
            </label>

            <input
              type="text"
              value={form.currency}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  currency:
                    event.target.value.toUpperCase(),
                }))
              }
              placeholder="ZAR"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Category
            </label>

            <select
              value={form.category_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category_id:
                    event.target.value,
                }))
              }
              className="w-full border rounded px-3 py-2 bg-white"
            >
              <option value="">
                No category
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

            {!categoriesLoading &&
              !categories?.length && (
                <p className="text-xs text-gray-500 mt-1">
                  Create a category above first.
                </p>
              )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Stock quantity
            </label>

            <input
              type="number"
              min="0"
              step="1"
              required
              value={form.stock}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  stock: event.target.value,
                }))
              }
              placeholder="0"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Status
            </label>

            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status:
                    event.target
                      .value as ProductForm['status'],
                }))
              }
              className="w-full border rounded px-3 py-2 bg-white"
            >
              <option value="active">
                Active
              </option>
              <option value="inactive">
                Inactive
              </option>
              <option value="archived">
                Archived
              </option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Description
            </label>

            <textarea
              rows={4}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description:
                    event.target.value,
                }))
              }
              placeholder="Product description"
              className="w-full border rounded px-3 py-2 resize-y"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">
              Product image
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full border rounded px-3 py-2 bg-white"
            />

            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG, WEBP, or another supported
              image format. Maximum size: 5 MB.
            </p>

            {imagePreview && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">
                  Image preview
                </p>

                <img
                  src={imagePreview}
                  alt="Product preview"
                  className="w-40 h-40 object-cover rounded-lg border"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="bg-black text-white rounded px-5 py-2 disabled:opacity-50"
          >
            {isSaving
              ? editingProduct
                ? 'Saving…'
                : 'Creating…'
              : editingProduct
                ? 'Save changes'
                : 'Create product'}
          </button>

          {editingProduct && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="border rounded px-5 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Products */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            Products
          </h2>

          <span className="text-sm text-gray-500">
            {products?.length ?? 0} product
            {(products?.length ?? 0) === 1
              ? ''
              : 's'}
          </span>
        </div>

        {isLoading && (
          <div className="border rounded-lg p-6 text-center text-gray-500">
            Loading products…
          </div>
        )}

        {productsError && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-6 text-red-700">
            Failed to load products.
          </div>
        )}

        {!isLoading &&
          !productsError &&
          !products?.length && (
            <div className="border rounded-lg p-6 text-center text-gray-500">
              No products yet.
            </div>
          )}

        <div className="space-y-3">
          {products?.map((product) => {
            const stock =
              product.inventory?.quantity ?? 0

            const isActive =
              product.status === 'active'

            const productImage =
              product.product_images?.[0]

            const productCategory =
              categories?.find(
                (category) =>
                  category.id ===
                  product.category_id
              )

            return (
              <div
                key={product.id}
                className="border rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex gap-4">
                    {productImage ? (
                      <img
                        src={productImage.url}
                        alt={
                          productImage.alt_text ??
                          product.name
                        }
                        className="w-20 h-20 object-cover rounded-lg border"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg border bg-gray-100 flex items-center justify-center text-xs text-gray-400 text-center">
                        No image
                      </div>
                    )}

                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-semibold">
                          {product.name}
                        </h3>

                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            product.status ===
                            'active'
                              ? 'bg-green-100 text-green-700'
                              : product.status ===
                                  'inactive'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {product.status}
                        </span>

                        {productCategory && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            {productCategory.name}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-500 mt-1">
                        SKU: {product.sku}
                      </p>

                      <p className="text-sm mt-2">
                        {product.currency}{' '}
                        {Number(
                          product.price
                        ).toFixed(2)}
                        {' · '}
                        Stock: {stock}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleEdit(product)
                      }
                      className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={
                        toggleProductStatus.isPending
                      }
                      onClick={() =>
                        toggleProductStatus.mutate(
                          product
                        )
                      }
                      className={`rounded px-3 py-2 text-sm text-white disabled:opacity-50 ${
                        isActive
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {isActive
                        ? 'Deactivate'
                        : 'Activate'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}