import { createClient } from '@supabase/supabase-js';

// Cliente con service_role: BYPASSEA RLS. Sólo usar en servidor (Server Actions,
// Route Handlers, scripts). NUNCA expongas la key al frontend.
export function getSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
