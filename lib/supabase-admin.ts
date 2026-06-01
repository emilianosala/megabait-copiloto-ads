import { createClient } from '@supabase/supabase-js';

// Service role client — bypasa RLS. Solo usar server-side, nunca exponer al browser.
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
