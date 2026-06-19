import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { getUserOrgId } from '@/lib/organizations';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  const orgId = await getUserOrgId(admin, user.id);
  if (!orgId) return NextResponse.json([]);

  // Siempre acotado a la org del usuario: sin esto el endpoint devolvía
  // alertas de todas las organizaciones.
  const query = admin
    .from('alerts')
    .select('id, name, condition_type, condition_value, date_preset, notify_email, notify_inapp, notify_emails, is_active, last_triggered_at, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (clientId) query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
