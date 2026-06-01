import { SupabaseClient } from '@supabase/supabase-js';

// Devuelve el organization_id del usuario.
// Por ahora cada usuario pertenece a una sola org; cuando llegue P12 completo
// se añadirá selección explícita de org activa.
export async function getUserOrgId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}
