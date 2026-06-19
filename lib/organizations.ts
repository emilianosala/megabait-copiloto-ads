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

// ── Autorización a nivel de objeto ──────────────────────────────────────────────
// Como las API routes usan el admin client (que bypasea RLS), CADA acceso a un
// recurso por su ID tiene que verificar a mano que pertenece a la org del usuario.
// Sin esto, cualquier usuario logueado puede leer/editar/borrar datos de otra org
// cambiando el ID en la URL (IDOR).

// Devuelve el cliente si pertenece a la org del usuario; null si no existe o es de otra org.
export async function getClientForUser(
  admin: SupabaseClient,
  userId: string,
  clientId: string,
  columns: string = '*',
): Promise<Record<string, any> | null> {
  const orgId = await getUserOrgId(admin, userId);
  if (!orgId) return null;

  const { data } = await admin
    .from('clients')
    .select(columns)
    .eq('id', clientId)
    .eq('organization_id', orgId)
    .maybeSingle();

  return (data as Record<string, any> | null) ?? null;
}

// Verifica que una fila (de cualquier tabla con columna organization_id) pertenezca
// a la org del usuario. Sirve para alerts, alert_notifications, reports, etc.
export async function rowBelongsToUserOrg(
  admin: SupabaseClient,
  userId: string,
  table: string,
  rowId: string,
): Promise<boolean> {
  const orgId = await getUserOrgId(admin, userId);
  if (!orgId) return false;

  const { data } = await admin
    .from(table)
    .select('id')
    .eq('id', rowId)
    .eq('organization_id', orgId)
    .maybeSingle();

  return !!data;
}
