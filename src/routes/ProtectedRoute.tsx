import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

// Wrap routes that require a logged-in user. requireAdmin also gates on
// the profile's role. NOTE: this only hides the UI — the real
// enforcement is the RLS policies in the database, which is where it
// actually matters. Never rely on this component alone for security.
export function ProtectedRoute({ requireAdmin = false }: { requireAdmin?: boolean }) {
  const { session, profile, loading } = useAuth()

  if (loading) return <div className="p-8 text-center">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (requireAdmin && profile?.role !== 'admin') return <Navigate to="/" replace />

  return <Outlet />
}