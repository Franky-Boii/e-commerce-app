import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env.local file',
  )
}

// This client uses the public anon key and is safe to use in the browser.
// Row Level Security policies (see supabase/migrations/0001_init.sql) are
// what actually enforce who can read/write what — the anon key alone
// grants no special access.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)