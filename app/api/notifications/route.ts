import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();

  // Obtener organization_id del usuario
  const { data: member } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) return NextResponse.json([]);

  const { data: notifs, error } = await admin
    .from('alert_notifications')
    .select('id, message, metric_value, read, created_at, client_id, alert_id')
    .eq('organization_id', member.organization_id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!notifs || notifs.length === 0) return NextResponse.json([]);

  // Enriquecer con nombres de alerta y cliente
  const alertIds = [...new Set(notifs.map((n) => n.alert_id))];
  const clientIds = [...new Set(notifs.map((n) => n.client_id))];

  const [{ data: alertsData }, { data: clientsData }] = await Promise.all([
    admin.from('alerts').select('id, name').in('id', alertIds),
    admin.from('clients').select('id, name').in('id', clientIds),
  ]);

  const alertMap = Object.fromEntries((alertsData ?? []).map((a) => [a.id, a]));
  const clientMap = Object.fromEntries((clientsData ?? []).map((c) => [c.id, c]));

  const enriched = notifs.map((n) => ({
    ...n,
    alerts: alertMap[n.alert_id] ?? null,
    clients: clientMap[n.client_id] ?? null,
  }));

  return NextResponse.json(enriched);
}

export async function PATCH() {
  // Marcar todas como leídas
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();

  const { data: member } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) return NextResponse.json({ success: true });

  await admin
    .from('alert_notifications')
    .update({ read: true })
    .eq('organization_id', member.organization_id)
    .eq('read', false);

  return NextResponse.json({ success: true });
}
