
import { createClient } from '@supabase/supabase-js'

// Load environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Validate environment variables
if (!supabaseUrl) {
  throw new Error(
    'Missing VITE_SUPABASE_URL. Check your .env.local file.'
  )
}

if (!supabasePublishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_PUBLISHABLE_KEY. Check your .env.local file.'
  )
}

// Validate Supabase URL
try {
  new URL(supabaseUrl)
} catch {
  throw new Error(
    'Invalid VITE_SUPABASE_URL. Check your Supabase project URL.'
  )
}

// Create Supabase client
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)