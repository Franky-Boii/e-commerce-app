export type UserRole = 'customer' | 'admin'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
}

export interface Address {
  id: string
  user_id: string
  line1: string
  line2: string | null
  city: string
  province: string | null
  postal_code: string
  country: string
  is_default: boolean
  created_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  slug: string
  description: string | null
  price: number
  currency: string
  category_id: string | null
  status: 'active' | 'inactive' | 'archived'
  product_images?: {
    id: string
    url: string
    alt_text: string | null
    sort_order: number
  }[]
  inventory?: { quantity: number }
}

export interface CartItem {
  id: string
  cart_id: string
  product_id: string
  quantity: number
  product?: Product
}

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export interface OrderItem {
  id: string
  product_id: string | null
  product_name: string
  sku: string
  unit_price: number
  quantity: number
  line_total: number
}

export interface Order {
  id: string
  status: OrderStatus
  subtotal: number
  delivery_fee: number
  total: number
  currency: string
  shipping_address_id: string | null
  created_at: string
  order_items?: OrderItem[]
  shipping_address?: Address | null
}