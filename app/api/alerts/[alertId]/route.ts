import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { rowBelongsToUserOrg } from '@/lib/organizations';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const { alertId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  if (!(await rowBelongsToUserOrg(admin, user.id, 'alerts', alertId))) {
    return NextResponse.json({ error: 'Alerta no encontrada' }, { status: 404 });
  }

  const body = await request.json();
  const allowed = ['is_active', 'notify_email', 'notify_inapp', 'notify_emails', 'condition_value', 'date_preset'];
  const patch: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await admin
    .from('alerts')
    .update(patch)
    .eq('id', alertId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const { alertId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  if (!(await rowBelongsToUserOrg(admin, user.id, 'alerts', alertId))) {
    return NextResponse.json({ error: 'Alerta no encontrada' }, { status: 404 });
  }

  const { error } = await admin.from('alerts').delete().eq('id', alertId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
