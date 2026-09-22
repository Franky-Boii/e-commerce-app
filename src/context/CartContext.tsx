import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from './AuthContext'
import { CartItem, Product } from '@/types'

interface CartContextValue {
  items: CartItem[]
  loading: boolean
  subtotal: number
  addItem: (product: Product, quantity?: number) => Promise<void>
  updateQuantity: (itemId: string, quantity: number) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  refresh: () => Promise<void>
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)

  // Get (or lazily create) the current user's cart row, then load its items
  // with the joined product data.
  const refresh = useCallback(async () => {
    if (!session?.user) {
      setItems([])
      return
    }
    setLoading(true)

    let { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (!cart) {
      const { data: newCart, error: createErr } = await supabase
        .from('carts')
        .insert({ user_id: session.user.id })
        .select('id')
        .single()
      if (createErr) {
        setLoading(false)
        throw createErr
      }
      cart = newCart
    }

    const { data: cartItems, error } = await supabase
      .from('cart_items')
      .select('id, cart_id, product_id, quantity, product:products(*, product_images(*), inventory(*))')
      .eq('cart_id', cart!.id)

    if (!error) setItems((cartItems ?? []) as unknown as CartItem[])
    setLoading(false)
  }, [session])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addItem(product: Product, quantity = 1) {
    if (!session?.user) throw new Error('Must be signed in to add to cart')

    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', session.user.id)
      .single()
    if (!cart) throw new Error('Cart not found')

    const existing = items.find((i) => i.product_id === product.id)
    if (existing) {
      await updateQuantity(existing.id, existing.quantity + quantity)
      return
    }

    const { error } = await supabase
      .from('cart_items')
      .insert({ cart_id: cart.id, product_id: product.id, quantity })
    if (error) throw error
    await refresh()
  }

  async function updateQuantity(itemId: string, quantity: number) {
    if (quantity <= 0) return removeItem(itemId)
    const { error } = await supabase.from('cart_items').update({ quantity }).eq('id', itemId)
    if (error) throw error
    await refresh()
  }

  async function removeItem(itemId: string) {
    const { error } = await supabase.from('cart_items').delete().eq('id', itemId)
    if (error) throw error
    await refresh()
  }

  const subtotal = items.reduce((sum, i) => sum + (i.product?.price ?? 0) * i.quantity, 0)

  return (
    <CartContext.Provider
      value={{ items, loading, subtotal, addItem, updateQuantity, removeItem, refresh }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
