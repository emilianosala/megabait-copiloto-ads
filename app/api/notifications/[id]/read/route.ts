import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { rowBelongsToUserOrg } from '@/lib/organizations';
import { NextResponse } from 'next/server';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createSupabaseAdmin();
  if (!(await rowBelongsToUserOrg(admin, user.id, 'alert_notifications', id))) {
    return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 });
  }

  const { error } = await admin
    .from('alert_notifications')
    .update({ read: true })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
