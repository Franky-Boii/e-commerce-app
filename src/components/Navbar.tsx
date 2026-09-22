import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'

export default function Navbar() {
  const { session, profile, signOut } = useAuth()
  const { items } = useCart()
  const itemCount = items.reduce((n, i) => n + i.quantity, 0)

  return (
    <nav className="border-b px-6 py-4 flex justify-between items-center">
      <Link to="/" className="font-semibold text-lg">Shop</Link>
      <div className="flex items-center gap-6 text-sm">
        <Link to="/">Catalog</Link>
        {session && <Link to="/cart">Cart ({itemCount})</Link>}
        {session && <Link to="/orders">Orders</Link>}
        {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
        {session ? (
          <button onClick={() => signOut()} className="underline">Log out</button>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  )
}