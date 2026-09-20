import { Routes, Route } from 'react-router-dom'
import { CartProvider } from '@/context/CartContext'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import Navbar from '@/components/Navbar'
import ProductCatalog from '@/pages/ProductCatalog'
import ProductDetail from '@/pages/ProductDetail'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Cart from '@/pages/Cart'
import Checkout from '@/pages/Checkout'
import OrderHistory from '@/pages/OrderHistory'
import AdminDashboard from '@/pages/admin/AdminDashboard'

export default function App() {
  return (
    <CartProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<ProductCatalog />} />
        <Route path="/products/:slug" element={<ProductDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<OrderHistory />} />
        </Route>

        <Route element={<ProtectedRoute requireAdmin />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>
      </Routes>
    </CartProvider>
  )
}
